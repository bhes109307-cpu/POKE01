/**
 * 寶可夢 3D 對戰遊戲核心邏輯
 * 實作 GraphQL 預載、3D 旋轉木馬與 RWD 戰鬥系統
 */

let globalZhDict = {};
let currentRotation = 0;
let isDragging = false;
let startX = 0;
let selectedPokemon = null;

// --- 1. 資料預載入 (GraphQL) ---
async function initGame() {
    const loaderText = document.getElementById('loader-text');
    const drawBtn = document.getElementById('draw-btn');
    drawBtn.disabled = true;

    try {
        loaderText.innerText = "正在下載全國中文圖鑑 (1-1025)...";
        
        // GraphQL 查詢：獲取 ID 與 繁體中文名稱 (local_language_id: 4 為繁中, 12 為簡中作備案)
        const GQL_QUERY = `
        query getChineseNames {
          pokemon_v2_pokemonspecies(where: {id: {_lte: 1025}}) {
            id
            pokemon_v2_pokemonspeciesnames(where: {language_id: {_in: [4, 12]}}) {
              name
              language_id
            }
          }
        }`;

        const response = await fetch('https://beta.pokeapi.co/graphql/v1beta', {
            method: 'POST',
            body: JSON.stringify({ query: GQL_QUERY })
        });
        const json = await response.json();

        // 整理字典：優先存入繁中
        json.data.pokemon_v2_pokemonspecies.forEach(item => {
            const names = item.pokemon_v2_pokemonspeciesnames;
            // 優先找 language_id 4
            const zhName = names.find(n => n.language_id === 4) || names.find(n => n.language_id === 12);
            globalZhDict[item.id] = zhName ? zhName.name : '未知';
        });

        loaderText.innerText = "圖鑑下載完成！";
        setTimeout(() => document.getElementById('loader').style.display = 'none', 800);
        drawBtn.disabled = false;
    } catch (err) {
        console.error(err);
        loaderText.innerText = "API 連線失敗，請檢查網路。";
    }
}

// --- 2. 抽卡邏輯 (屬性去重) ---
async function drawFiveCards() {
    const carousel = document.getElementById('carousel');
    const drawBtn = document.getElementById('draw-btn');
    drawBtn.disabled = true;
    carousel.innerHTML = '<p class="text-white">正在召喚不同屬性的寶可夢...</p>';

    let drawnList = [];
    let usedTypes = new Set();

    while (drawnList.length < 5) {
        const randomId = Math.floor(Math.random() * 1010) + 1; // 1-1010 較穩
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${randomId}`);
        const data = await res.json();
        
        const types = data.types.map(t => t.type.name);
        // 檢查是否有任一屬性重複
        const hasOverlap = types.some(t => usedTypes.has(t));

        if (!hasOverlap) {
            data.zhName = globalZhDict[data.id] || data.name;
            drawnList.push(data);
            types.forEach(t => usedTypes.add(t));
        }
    }

    renderCarousel(drawnList);
    drawBtn.disabled = false;
}

// --- 3. 3D 渲染與互動 ---
function renderCarousel(list) {
    const carousel = document.getElementById('carousel');
    carousel.innerHTML = '';
    const radius = 280; // 旋轉半徑

    list.forEach((poke, i) => {
        const angle = i * (360 / 5);
        const card = document.createElement('div');
        card.className = "pokemon-card-3d bg-slate-100 rounded-xl border-4 border-yellow-400 p-2 shadow-2xl flex flex-col";
        card.style.transform = `rotateY(${angle}deg) translateZ(${radius}px)`;
        
        const hp = poke.stats[0].base_stat * 3;
        const atk = poke.stats[1].base_stat;

        card.innerHTML = `
            <div class="flex justify-between items-start text-slate-800 font-bold text-xs">
                <span>#${poke.id}</span>
                <span class="text-red-600">HP ${hp}</span>
            </div>
            <img src="${poke.sprites.other['official-artwork'].front_default}" class="w-full h-32 object-contain my-2">
            <h3 class="text-slate-900 font-black text-center text-lg leading-tight">${poke.zhName}</h3>
            <p class="text-slate-500 text-[10px] text-center uppercase mb-2">${poke.name}</p>
            <div class="flex flex-wrap gap-1 justify-center mb-2">
                ${poke.types.map(t => `<span class="bg-slate-700 text-white px-2 py-0.5 rounded text-[10px] uppercase">${t.type.name}</span>`).join('')}
            </div>
            <div class="mt-auto border-t pt-2 flex justify-between items-center">
                <span class="text-orange-600 font-bold text-sm">ATK ${atk}</span>
                <button onclick='selectForBattle(${JSON.stringify({id: poke.id, name: poke.zhName, hp, atk, img: poke.sprites.other['official-artwork'].front_default})})' 
                    class="bg-blue-600 text-white px-3 py-1 rounded-md text-xs hover:bg-blue-700">選擇</button>
            </div>
        `;
        carousel.appendChild(card);
    });
}

// 旋轉控制 (滑鼠 + 觸控)
function handleMove(e) {
    if (!isDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const deltaX = clientX - startX;
    currentRotation += deltaX * 0.5;
    document.getElementById('carousel').style.transform = `rotateY(${currentRotation}deg)`;
    startX = clientX;
}

window.addEventListener('mousedown', (e) => { isDragging = true; startX = e.clientX; });
window.addEventListener('touchstart', (e) => { isDragging = true; startX = e.touches[0].clientX; });
window.addEventListener('mousemove', handleMove);
window.addEventListener('touchmove', handleMove);
window.addEventListener('mouseup', () => isDragging = false);
window.addEventListener('touchend', () => isDragging = false);

// --- 4. 戰鬥系統 ---
async function selectForBattle(poke) {
    selectedPokemon = poke;
    document.getElementById('select-phase').classList.add('hidden');
    document.getElementById('battle-phase').classList.remove('hidden');

    // 生成玩家卡牌
    renderStaticCard('player-slot', poke, 'blue');

    // 隨機抽一個對手
    const cpuId = Math.floor(Math.random() * 800) + 1;
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${cpuId}`);
    const data = await res.json();
    const cpuPoke = {
        name: globalZhDict[data.id] || data.name,
        hp: data.stats[0].base_stat * 3,
        atk: data.stats[1].base_stat,
        img: data.sprites.other['official-artwork'].front_default
    };
    renderStaticCard('cpu-slot', cpuPoke, 'red');
    
    window.cpuPokemon = cpuPoke;
    addLog(`你選擇了 ${poke.name}！`);
    addLog(`對手派出了 ${cpuPoke.name}！`);
}

function renderStaticCard(slotId, poke, color) {
    document.getElementById(slotId).innerHTML = `
        <div class="bg-white w-48 p-3 rounded-xl border-4 border-${color}-500 text-slate-900 shadow-xl">
            <div class="flex justify-between font-bold text-xs">
                <span>HP</span><span id="${slotId}-hp">${poke.hp}</span>
            </div>
            <div class="w-full bg-slate-200 h-2 mt-1 rounded-full overflow-hidden">
                <div id="${slotId}-bar" class="bg-green-500 h-full w-full transition-all"></div>
            </div>
            <img src="${poke.img}" class="w-full h-32 object-contain my-2">
            <h3 class="font-black text-center">${poke.name}</h3>
        </div>
    `;
}

async function startBattle() {
    const btn = document.getElementById('start-battle-btn');
    btn.disabled = true;
    let p = selectedPokemon;
    let c = window.cpuPokemon;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    while (p.hp > 0 && c.hp > 0) {
        // 玩家回合
        let pDmg = Math.floor(p.atk * (0.8 + Math.random() * 0.4));
        c.hp -= pDmg;
        addLog(`${p.name} 發動攻擊，造成 ${pDmg} 點傷害！`);
        updateBattleUI('cpu-slot', c);
        await sleep(800);
        if (c.hp <= 0) break;

        // 對手回合
        let cDmg = Math.floor(c.atk * (0.8 + Math.random() * 0.4));
        p.hp -= cDmg;
        addLog(`野生的 ${c.name} 反擊，造成 ${cDmg} 點傷害！`);
        updateBattleUI('player-slot', p);
        await sleep(800);
    }

    addLog(p.hp > 0 ? `★ ${p.name} 贏得了勝利！` : `✖ ${p.name} 倒下了...`);
}

function updateBattleUI(slotId, poke) {
    const hpText = document.getElementById(`${slotId}-hp`);
    const hpBar = document.getElementById(`${slotId}-bar`);
    const maxHp = slotId === 'player-slot' ? selectedPokemon.hp + 99 : 500; // 簡易比例
    
    hpText.innerText = Math.max(0, poke.hp);
    const percent = Math.max(0, (poke.hp / (poke.hp + 100)) * 100); // 視覺比例模擬
    hpBar.style.width = `${percent}%`;
}

function addLog(msg) {
    const log = document.getElementById('battle-log');
    const div = document.createElement('div');
    div.className = "mb-1 border-l-2 border-green-900 pl-2 py-1";
    div.innerText = `> ${msg}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}

// 綁定按鈕
document.getElementById('draw-btn').addEventListener('click', drawFiveCards);
document.getElementById('start-battle-btn').addEventListener('click', startBattle);

// 啟動
window.onload = initGame;