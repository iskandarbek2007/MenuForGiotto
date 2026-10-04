(() => {
'use strict';
const {categories,items}=window.MENU_DATA;
const byId=new Map(items.map(x=>[String(x.id),x]));
const validOrderIds=new Set([...byId.keys(),...(window.MENU_DATA.legacyItemIds||[])]);
const cats=new Map(categories.map(x=>[String(x.id),x]));
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('ru-RU').format(n);
const normalize=s=>String(s).toLocaleLowerCase().replace(/ё/g,'е').trim();
const TABLE_COUNT=30;
const KEY='giotto-orders-v1-table-';
let orders={},table=null,filter='all',category='all',query='',detailId=null,clearTarget=null,clearRevision=null,storageOK=true,toastTimer,cartOpen=false,cartScroll=0;
const sum=o=>o.lines.reduce((s,l)=>s+l.price*l.qty,0);
const count=o=>o.lines.reduce((s,l)=>s+l.qty,0);
const blank=()=>({version:1,lines:[],updatedAt:null});
function storageFailure(message){storageOK=false;$('storageError').hidden=false;$('storageError').textContent=message;$('saveState').textContent='Сохранение недоступно';}
function readTable(n){
 const raw=localStorage.getItem(KEY+n);if(!raw)return blank();
 const o=JSON.parse(raw);
 if(o.version!==1||!Array.isArray(o.lines)||o.lines.some(l=>!validOrderIds.has(l.id)||typeof l.name!=='string'||!Number.isSafeInteger(l.price)||l.price<0||!Number.isSafeInteger(l.qty)||l.qty<1||l.qty>999)||new Set(o.lines.map(l=>l.id)).size!==o.lines.length)throw Error('invalid');
 return o;
}
function load(){
 storageOK=true;$('storageError').hidden=true;
 try{for(let n=1;n<=TABLE_COUNT;n++)orders[n]=readTable(n);$('saveState').textContent='Автосохранение включено';}
 catch(e){storageFailure('Не удалось прочитать сохранённые заказы. Добавление и очистка остановлены, чтобы не потерять данные. Проверьте доступ к хранилищу браузера. Существующие записи не удалены.');}
 for(let n=1;n<=TABLE_COUNT;n++)orders[n]??=blank();
}
function mutate(n,change){
 if(!storageOK){toast('Хранилище недоступно. Заказ не изменён.');return false;}
 try{
  const latest=readTable(n);change(latest);latest.updatedAt=new Date().toISOString();
  localStorage.setItem(KEY+n,JSON.stringify(latest));orders[n]=latest;
  $('saveState').textContent='Сохранено '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  return true;
 }catch(e){storageFailure('Не удалось сохранить заказ. Последнее изменение не применено. Освободите место или разрешите хранение данных в браузере, затем обновите страницу.');renderCart();return false;}
}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2200);}
const tableIcon='<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="8" y="8" width="16" height="16" rx="4"/><path d="M12 3h8M12 29h8M3 12v8M29 12v8" stroke-linecap="round"/></svg>';
function renderTables(){
 const occupied=Object.values(orders).filter(o=>o.lines.length).length;
 $('busyStat').textContent=occupied;$('freeStat').textContent=TABLE_COUNT-occupied;
 $('totalStat').innerHTML=fmt(Object.values(orders).reduce((s,o)=>s+sum(o),0))+' <small>сум</small>';
 let html='';for(let n=1;n<=TABLE_COUNT;n++){
  const o=orders[n],busy=!!o.lines.length;
  if((filter==='busy'&&!busy)||(filter==='free'&&busy))continue;
  html+=`<button class="table-card ${busy?'busy':''}" data-table="${n}" aria-label="Столик ${n}, ${busy?'есть заказ, '+fmt(sum(o))+' сум':'свободен'}"><span class="table-top"><span class="table-number">${String(n).padStart(2,'0')}</span><span class="table-symbol">${tableIcon}</span></span><span class="table-status">${busy?count(o)+' шт. в заказе':'Свободен'}</span>${busy?`<span class="table-amount">${fmt(sum(o))} сум</span>`:'<span class="free-mark">—</span>'}</button>`;
 }
 $('tableGrid').innerHTML=html;$('tablesEmpty').hidden=!!html;
 $('tablesEmpty').textContent=filter==='free'?'Все столики с заказами.':'Столиков с заказами пока нет.';
}
function matchesCategory(item){return category==='all'||item.category_id===category||cats.get(item.category_id)?.parent_id===category;}
function renderMenu(){
 const q=normalize(query);
 const result=items.filter(x=>matchesCategory(x)&&(!q||normalize([x.ru,x.uz,x.en,x.description_ru,cats.get(x.category_id)?.ru].join(' ')).includes(q)));
 $('resultCount').textContent=`${result.length} из ${items.length}`;
 $('dishGrid').innerHTML=result.map(x=>{
  const qty=table?orders[table].lines.find(l=>l.id===x.id)?.qty:0;
  return `<article class="dish"><button class="dish-photo" data-detail="${esc(x.id)}" aria-label="Подробнее: ${esc(x.ru.trim())}"><img src="${esc(x.image)}" alt="${esc(x.ru.trim())}" loading="lazy"></button><div class="dish-body"><div class="dish-category">${esc(cats.get(x.category_id)?.ru.trim())}</div><h3 class="dish-name">${esc(x.ru.trim())}</h3><p class="dish-description">${esc((x.description_ru||'').trim())}</p><div class="dish-bottom"><span class="dish-price">${fmt(Number(x.price))} <small>сум</small></span><div class="dish-quantity"><button class="dish-minus" data-dish-minus="${esc(x.id)}" aria-label="Уменьшить количество: ${esc(x.ru.trim())}" hidden>−</button><span class="dish-qty" data-dish-count="${esc(x.id)}" hidden>0</span><button class="add-button" data-add="${esc(x.id)}" aria-label="Добавить ${esc(x.ru.trim())}${qty?', уже '+qty+' в заказе':''}" ${!table||!storageOK?'disabled':''} title="${table?'Добавить в заказ':'Сначала выберите столик'}">+</button></div></div></div></article>`;
 }).join('');
 $('dishesEmpty').hidden=!!result.length;
 $('categorySelect').value=category;
 document.querySelectorAll('[data-category]').forEach(b=>{const a=b.dataset.category===category;b.classList.toggle('active',a);b.setAttribute('aria-pressed',String(a));});
 attachImageFallbacks();syncDishControls();
}
function attachImageFallbacks(){
 document.querySelectorAll('.dish-photo img').forEach(img=>img.onerror=()=>{img.hidden=true;const text=document.createElement('span');text.textContent='Фото недоступно';text.style.cssText='font-size:13px;color:#74807b';img.parentNode.append(text);});
}
function syncDishControls(){
 document.querySelectorAll('[data-add]').forEach(b=>{
  const id=b.dataset.add,q=table?orders[table].lines.find(l=>l.id===id)?.qty||0:0;
  const group=b.parentElement,minus=group.querySelector('[data-dish-minus]'),label=group.querySelector('[data-dish-count]');
  b.disabled=!table||!storageOK||q>=999;
  if(minus){minus.hidden=!q;minus.disabled=!storageOK;label.hidden=!q;label.textContent=q;}
 });
}
function closeCart(){
 if(!cartOpen)return;cartOpen=false;$('orderPanel').classList.remove('mobile-open');$('orderPanel').removeAttribute('role');$('orderPanel').removeAttribute('aria-modal');$('cartShade').hidden=true;$('openCart').setAttribute('aria-expanded','false');
 document.body.classList.remove('cart-locked');document.body.style.top='';window.scrollTo(0,cartScroll);$('openCart').focus();
}
function openCart(){
 if(window.innerWidth>650||!table)return;cartScroll=window.scrollY;cartOpen=true;$('orderPanel').classList.add('mobile-open');$('orderPanel').setAttribute('role','dialog');$('orderPanel').setAttribute('aria-modal','true');$('cartShade').hidden=false;$('openCart').setAttribute('aria-expanded','true');
 document.body.style.top=-cartScroll+'px';document.body.classList.add('cart-locked');$('closeCart').focus();
}
function changeQuantity(id,delta){
 if(!table)return;
 if(mutate(table,o=>{const l=o.lines.find(l=>l.id===id);if(!l)return;l.qty=Math.min(999,l.qty+delta);o.lines=o.lines.filter(x=>x.qty>0);})){renderCart();renderTables();}
}
function renderCart(){
 $('orderDock').hidden=!table||$('orderView').hidden;
 $('dockTable').textContent=table?'Столик '+String(table).padStart(2,'0'):'';
 $('cartTitle').textContent=table?'Столик '+String(table).padStart(2,'0'):'Выберите столик';
 const o=table?orders[table]:blank();$('cartBadge').textContent=count(o);
 $('cartTotal').innerHTML=fmt(sum(o))+' <small>сум</small>';
 $('dockCount').textContent='Заказ · '+count(o);$('dockTotal').textContent=fmt(sum(o))+' сум';syncDishControls();
 $('clearTable').disabled=!table||!o.lines.length||!storageOK;
 $('cartSaved').textContent=storageOK?(o.updatedAt?'Сохранено в '+new Date(o.updatedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'Заказ сохраняется автоматически'):'Сохранение недоступно';
 $('cartItems').innerHTML=o.lines.length?o.lines.map(l=>`<div class="cart-row"><h3>${esc(l.name)}</h3><div class="cart-row-bottom"><div class="quantity-control"><button data-qty="${esc(l.id)}" data-delta="-1" aria-label="Уменьшить количество: ${esc(l.name)}" ${storageOK?'':'disabled'}>−</button><span>${l.qty}</span><button data-qty="${esc(l.id)}" data-delta="1" aria-label="Увеличить количество: ${esc(l.name)}" ${storageOK?'':'disabled'}>+</button></div><span class="line-price">${fmt(l.qty*l.price)} сум</span></div></div>`).join(''):`<div class="cart-empty"><span aria-hidden="true">≡</span>${table?'Заказ пока пуст.<br>Добавьте блюда из меню.':'Выберите столик сверху,<br>чтобы принять заказ.'}</div>`;
}
function renderOrder(){
 $('tableSelect').value=table||'';$('orderTitle').textContent=table?'Столик '+String(table).padStart(2,'0'):'Меню ресторана';
 $('orderSubtitle').textContent=table?'Добавляйте блюда — заказ сохраняется автоматически.':'Выберите столик для добавления блюд.';
 renderCart();renderMenu();
}
function route(){
 closeCart();
 if($('clearDialog').open)$('clearDialog').close();
 if($('dishDialog').open)$('dishDialog').close();
 const match=location.hash.match(/^#table\/(\d+)$/),n=match?Number(match[1]):null;
 table=n>=1&&n<=TABLE_COUNT?n:null;
 const menu=!!table||location.hash==='#menu';
 $('tablesView').hidden=menu;$('orderView').hidden=!menu;
 $('tablesNav').classList.toggle('active',!menu);$('menuNav').classList.toggle('active',menu);
 $('breadcrumb').innerHTML=menu?`Ресторан <span>/</span> ${table?'Столик '+String(table).padStart(2,'0'):'Меню'}`:'Ресторан <span>/</span> Столики';
 load();renderTables();$('orderDock').hidden=!menu||!table;if(menu)renderOrder();window.scrollTo(0,0);
}
function add(id){
 if(!table){toast('Сначала выберите столик.');return;}const x=byId.get(id);if(!x)return;
 if(mutate(table,o=>{const line=o.lines.find(l=>l.id===id);if(line){line.qty=Math.min(999,line.qty+1);}else o.lines.push({id,name:x.ru.trim(),price:Number(x.price),qty:1});})){
  renderCart();renderTables();toast(x.ru.trim()+' · добавлено');
 }
}
function detail(id){
 const x=byId.get(id);if(!x)return;detailId=id;
 $('detailImage').hidden=false;$('detailImage').src=x.image;$('detailImage').alt=x.ru.trim();$('detailImage').onerror=()=>{$('detailImage').hidden=true;};
 $('detailCategory').textContent=cats.get(x.category_id)?.ru.trim();$('detailName').textContent=x.ru.trim();$('detailDescription').textContent=x.description_ru||'Описание не указано в исходном меню.';$('detailPrice').textContent=fmt(Number(x.price))+' сум';$('detailAdd').disabled=!table||!storageOK;$('detailAdd').textContent=table?'Добавить в заказ':'Выберите столик';$('dishDialog').showModal();
}
function clearText(){const o=orders[clearTarget];$('clearDialogTitle').textContent='Очистить столик '+String(clearTarget).padStart(2,'0')+'?';$('clearDialogText').textContent=`Будут удалены все ${count(o)} шт. на сумму ${fmt(sum(o))} сум. После подтверждения столик станет свободным. Восстановить заказ нельзя.`;}
$('openCart').addEventListener('click',openCart);
$('closeCart').addEventListener('click',closeCart);$('cartShade').addEventListener('click',closeCart);
window.addEventListener('resize',()=>{if(window.innerWidth>650)closeCart();});
document.addEventListener('keydown',e=>{
 if(!cartOpen||$('clearDialog').open||$('dishDialog').open)return;
 if(e.key==='Escape'){e.preventDefault();closeCart();}
 if(e.key==='Tab'){
  const controls=[...$('orderPanel').querySelectorAll('button:not([disabled]),select,a[href]')].filter(x=>!x.hidden);
  const first=controls[0],last=controls[controls.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 }
});
$('menuCount').textContent=items.length;
$('today').textContent=new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',weekday:'long'});
for(let n=1;n<=TABLE_COUNT;n++)$('tableSelect').add(new Option('Столик '+String(n).padStart(2,'0'),String(n)));
$('categorySelect').add(new Option('Все категории','all'));
for(const c of categories)$('categorySelect').add(new Option((c.parent_id?'↳ ':'')+c.ru.trim(),c.id));
$('categoryChips').innerHTML='<button data-category="all" class="active all-categories"><span class="category-label">Все блюда</span></button>'+categories.filter(c=>!c.parent_id).map(c=>`<button data-category="${c.id}"><img src="${esc(c.image)}" alt="" loading="lazy"><span class="category-label">${esc(c.ru.trim())}</span></button>`).join('');
$('tableGrid').addEventListener('click',e=>{const b=e.target.closest('[data-table]');if(b)location.hash='table/'+b.dataset.table;});
$('tableFilters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});renderTables();});
$('tableSelect').addEventListener('change',e=>location.hash=e.target.value?'table/'+e.target.value:'menu');
$('search').addEventListener('input',e=>{query=e.target.value;renderMenu();});
$('categorySelect').addEventListener('change',e=>{category=e.target.value;renderMenu();});
$('categoryChips').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(b){category=b.dataset.category;renderMenu();}});
$('dishGrid').addEventListener('click',e=>{const b=e.target.closest('[data-add], [data-detail], [data-dish-minus]');if(!b)return;if(b.dataset.add)add(b.dataset.add);else if(b.dataset.dishMinus)changeQuantity(b.dataset.dishMinus,-1);else detail(b.dataset.detail);});
$('cartItems').addEventListener('click',e=>{const b=e.target.closest('[data-qty]');if(!b||!table)return;changeQuantity(b.dataset.qty,Number(b.dataset.delta));});
$('clearTable').addEventListener('click',()=>{if(!table||!storageOK)return;load();if(!orders[table].lines.length){renderCart();return;}clearTarget=table;clearRevision=JSON.stringify(orders[table]);clearText();$('clearDialog').showModal();$('cancelClear').focus();});
$('cancelClear').addEventListener('click',()=>$('clearDialog').close());
$('confirmClear').addEventListener('click',()=>{
 load();if(!storageOK){$('clearDialog').close();return;}
 if(JSON.stringify(orders[clearTarget])!==clearRevision){clearRevision=JSON.stringify(orders[clearTarget]);clearText();toast('Заказ изменился. Проверьте его перед очисткой.');return;}
 if(mutate(clearTarget,o=>{o.lines=[];})){renderCart();renderTables();renderMenu();$('clearDialog').close();toast('Столик '+clearTarget+' очищен');}
});
$('closeDish').addEventListener('click',()=>$('dishDialog').close());
$('detailAdd').addEventListener('click',()=>{add(detailId);$('dishDialog').close();});
for(const id of ['clearDialog','dishDialog'])$(id).addEventListener('click',e=>{if(e.target===$(id)){const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$(id).close();}});
window.addEventListener('hashchange',route);
window.addEventListener('storage',e=>{if(e.key===null||e.key.startsWith(KEY)){load();renderTables();if(!$('orderView').hidden){renderCart();renderMenu();}}});
window.addEventListener('pageshow',()=>{load();renderTables();if(!$('orderView').hidden)renderCart();});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('orderView').hidden){e.preventDefault();$('search').focus();}});
route();
})();
