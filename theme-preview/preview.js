(() => {
  'use strict';
  const root = document.getElementById('hyderabad-preview');
  const q = selector => root.querySelector(selector);
  const qa = selector => [...root.querySelectorAll(selector)];
  const MAX_PER_ORDER = 20;
  const storageKey = 'company-a-theme-preview:v1';
  // Sample availability only. Production must validate outlet stock on the server.
  // Optimized copies of the four user-supplied files in ../Images/.
  const dishes = {
    chicken: {name:'Chicken dum biryani', price:320, available:true, photo:'assets/chicken-biryani.jpg', position:'50% 62%'},
    veg: {name:'Vegetable biryani', price:260, available:true, photo:'assets/vegetable-biryani.jpg', position:'50% 68%'},
    salan: {name:'Mirchi ka salan', price:120, available:true, photo:'assets/mirchi-ka-salan.jpg', fit:'contain'},
    meetha: {name:'Double ka meetha', price:140, available:true, photo:'assets/double-ka-meetha.jpg', position:'50% 50%'}
  };
  const state = {category:'all', vegetarian:false, outlet:'Kondapur', cart:{}, cartOpen:false};
  const currency = value => '₹' + value.toLocaleString('en-IN');

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (!saved || typeof saved !== 'object') return;
      if (['all','biryani','sides','sweets'].includes(saved.category)) state.category=saved.category;
      state.vegetarian=saved.vegetarian===true;
      if (['Kondapur','Gachibowli','Kukatpally'].includes(saved.outlet)) state.outlet=saved.outlet;
      for (const id of Object.keys(dishes)) {
        const qty=saved.cart?.[id];
        if (dishes[id].available && Number.isInteger(qty) && qty>0 && qty<=MAX_PER_ORDER) state.cart[id]=qty;
      }
    } catch { /* Storage may be unavailable for a locally opened file. */ }
  }
  function save() {
    try { localStorage.setItem(storageKey,JSON.stringify(state)); } catch { /* In-memory cart still works. */ }
  }
  function announce(text) { q('#food-live').textContent=text; }
  function attachPhoto(image,id) {
    image.alt=dishes[id].name;
    image.style.objectPosition=dishes[id].position||'50% 50%';
    image.style.objectFit=dishes[id].fit||'cover';
    image.addEventListener('error',()=>{
      image.hidden=true;
      const fallback=image.parentElement.querySelector('.food-photo-fallback');
      if (fallback) { fallback.hidden=false; fallback.textContent='Photo unavailable'; }
    },{once:true});
    image.addEventListener('load',()=>{
      const fallback=image.parentElement.querySelector('.food-photo-fallback');
      if (fallback) fallback.hidden=true;
    },{once:true});
    image.src=dishes[id].photo;
  }
  function control(id,delta,context) {
    const button=document.createElement('button');
    button.type='button';button.className='cursor-interaction';
    button.textContent=delta>0?'+':'−';
    button.dataset.change=id;button.dataset.delta=delta;
    button.dataset.focus=`${context}-${id}-${delta>0?'plus':'minus'}`;
    button.setAttribute('aria-label',`${delta>0?'Add':'Remove'} one ${dishes[id].name}`);
    return button;
  }
  function stepper(id,context) {
    const group=document.createElement('div');
    group.className=context==='menu'?'food-menu-stepper':'food-quantity';
    group.setAttribute('role','group');group.setAttribute('aria-label',`${dishes[id].name} quantity`);
    const minus=control(id,-1,context),plus=control(id,1,context),quantity=document.createElement('span');
    quantity.dataset.quantityValue=id;
    group.append(minus,quantity,plus);
    return group;
  }
  qa('[data-dish]').forEach(card=>{
    const id=card.dataset.dish,button=card.querySelector('[data-add]');
    button.dataset.focus=`menu-${id}-add`;
    const group=stepper(id,'menu');group.hidden=true;
    button.after(group);
    const limit=document.createElement('p');limit.className='food-limit';limit.hidden=true;
    limit.textContent=`Maximum ${MAX_PER_ORDER} per order`;limit.dataset.limit=id;
    card.querySelector('.food-item-body').append(limit);
    const available=document.createElement('span');available.className='food-availability';
    available.textContent=dishes[id].available?'Available':'Sold out';
    card.querySelector('.food-item-image').append(available);
  });
  qa('[data-photo]').forEach(image=>attachPhoto(image,image.dataset.photo));

  function render() {
    const active=document.activeElement;
    const focusKey=active?.dataset?.focus;
    q('#food-outlet').value=state.outlet;
    q('#food-veg').checked=state.vegetarian;
    q('#food-footer-outlet').textContent=`${state.outlet} kitchen · Hyderabad`;
    qa('[data-category]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.category===state.category)));
    let visible=0;
    qa('[data-dish]').forEach(card=>{
      card.hidden=(state.category!=='all' && card.dataset.type!==state.category)||(state.vegetarian && card.dataset.vegetarian!=='true');
      if (!card.hidden) visible++;
      const id=card.dataset.dish,qty=state.cart[id]||0;
      const add=card.querySelector('[data-add]');
      add.hidden=qty>0;add.disabled=!dishes[id].available;
      add.textContent=dishes[id].available?'Add +':'Sold out';
      card.querySelector('.food-menu-stepper').hidden=qty===0;
      card.querySelector('[data-limit]').hidden=qty<MAX_PER_ORDER;
    });
    q('#food-empty').hidden=visible>0;
    const count=Object.values(state.cart).reduce((total,qty)=>total+qty,0);
    const total=Object.entries(state.cart).reduce((sum,[id,qty])=>sum+dishes[id].price*qty,0);
    q('#food-cart-count').textContent=count;
    q('#food-cart-button').setAttribute('aria-label',`Cart, ${count} ${count===1?'item':'items'}`);
    q('#food-cart-button').setAttribute('aria-expanded',String(state.cartOpen));
    q('#food-basket').hidden=!state.cartOpen;
    q('#food-cart-summary').hidden=count===0;
    q('#food-summary-text').textContent=`${count} ${count===1?'item':'items'} · ${currency(total)}`;
    q('#food-summary-button').setAttribute('aria-expanded',String(state.cartOpen));
    const container=q('#food-basket-lines');container.replaceChildren();
    if (!count) {
      const empty=document.createElement('p');empty.className='food-basket-name';
      empty.textContent='Your cart is empty. Choose something from the menu.';container.append(empty);
    }
    for (const [id,qty] of Object.entries(state.cart)) {
      const row=document.createElement('div');row.className='food-basket-line';
      const item=document.createElement('div');item.className='food-basket-item';
      const image=document.createElement('img');image.className='food-cart-photo';image.width=60;image.height=60;
      attachPhoto(image,id);
      const description=document.createElement('div');
      const name=document.createElement('div');name.className='food-basket-name';name.textContent=dishes[id].name;
      const price=document.createElement('div');price.className='food-basket-price';price.textContent=`${currency(dishes[id].price)} × ${qty} = ${currency(dishes[id].price*qty)}`;
      description.append(name,price);item.append(image,description);
      const group=stepper(id,'cart');row.append(item,group);container.append(row);
    }
    qa('[data-quantity-value]').forEach(value=>value.textContent=state.cart[value.dataset.quantityValue]||0);
    qa('[data-change]').forEach(button=>{
      const id=button.dataset.change,qty=state.cart[id]||0;
      button.disabled=Number(button.dataset.delta)>0?(!dishes[id].available||qty>=MAX_PER_ORDER):qty===0;
    });
    q('#food-subtotal').hidden=count===0;
    q('#food-total').textContent=currency(total);
    if (focusKey) {
      const preferred=qa('[data-focus]').find(button=>button.dataset.focus===focusKey);
      const id=active?.dataset?.change||active?.dataset?.add;
      const fallback=qa('[data-focus]').find(button=>button.dataset.focus===`menu-${id}-${state.cart[id]?'minus':'add'}`);
      const usable=button=>button && !button.disabled && !button.closest('[hidden]');
      if (usable(preferred)) preferred.focus({preventScroll:true});
      else if (usable(fallback)) fallback.focus({preventScroll:true});
      else q('#food-close-cart').focus({preventScroll:true});
    }
  }
  function change(id,delta) {
    if (!Object.hasOwn(dishes,id) || ![1,-1].includes(delta)) return;
    if (delta>0 && !dishes[id].available) { announce(`${dishes[id].name} is sold out.`);return; }
    const current=state.cart[id]||0;
    if (delta>0 && current>=MAX_PER_ORDER) { announce(`Maximum ${MAX_PER_ORDER} per order.`);return; }
    const qty=Math.max(0,current+delta);
    if (qty) state.cart[id]=qty;else delete state.cart[id];
    render();save();announce(`${dishes[id].name}: ${qty} in your cart.`);
  }
  function showCart() { state.cartOpen=true;render();q('#food-basket').scrollIntoView({block:'nearest',behavior:'instant'}); }
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if (!button || button.disabled) return;
    if (button.dataset.add) change(button.dataset.add,1);
    if (button.dataset.change) change(button.dataset.change,Number(button.dataset.delta));
  });
  qa('[data-category]').forEach(button=>button.addEventListener('click',()=>{state.category=button.dataset.category;render();save();}));
  q('#food-veg').addEventListener('change',event=>{state.vegetarian=event.target.checked;render();save();});
  q('#food-reset-filters').addEventListener('click',()=>{state.category='all';state.vegetarian=false;render();save();q('[data-category="all"]').focus();});
  q('#food-outlet').addEventListener('change',event=>{state.outlet=event.target.value;render();save();announce(`Selected ${state.outlet}. All four sample dishes are available.`);});
  q('#food-cart-button').addEventListener('click',()=>{if(state.cartOpen){state.cartOpen=false;render();}else showCart();});
  q('#food-summary-button').addEventListener('click',showCart);
  q('#food-close-cart').addEventListener('click',()=>{state.cartOpen=false;render();q('#food-cart-button').focus({preventScroll:true});});
  restore();render();
  if(window.lucide) window.lucide.createIcons({attrs:{width:16,height:16,'stroke-width':1.6}});
})();
