const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const root = require('node:path').resolve(__dirname, '..');
test('frontend persists edits, escapes names, renders QR and submits borrowing to API', async t => {
const dom = new JSDOM(fs.readFileSync(root + '/prototype/index.html', 'utf8'), { url: 'http://localhost:3000/#/room/1', runScripts: 'outside-only' });
const w = dom.window;
t.after(() => w.close());
w.scrollTo = () => {};
w.HTMLElement.prototype.scrollIntoView = function () {};
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
const clone = value => JSON.parse(JSON.stringify(value));
let snapshot = {data:{today:'2026-11-18',people:[],rooms:[{id:'1',name:'教具小屋'}],units:[{code:'A1',name:'測試櫃',room:'1',type:'shelf',layers:2,w:2,h:2,d:1,x:0,z:0,rotation:0}],items:[{id:'a',name:'<img src=x onerror=alert(1)>',unit:'A1',layer:1,total:2,assetNumber:'',code:'A1-1-a',x:.5,y:.4,image:''}],types:{shelf:'層架',box:'收納箱',cabinet:'櫃子',drawer:'抽屜櫃'}},state:{today:'2026-11-18',records:[],events:[],requests:[],handovers:[],mails:[],receipts:[]},user:null,revision:0,registrationEnabled:false};
const calls=[];
let rejectItemSave = false;
w.fetch = async (path, options={}) => {
  const body=JSON.parse(options.body || '{}'); calls.push({path,body});
  if (rejectItemSave && path.startsWith('/api/items/')) { rejectItemSave = false; return { ok:false, status:503, json:async()=>({error:'暫時無法儲存，請重試。'}) }; }
  let result;
  if(path==='/api/login') { snapshot.user={id:'admin',name:'管理者',email:'admin@example.com',role:'admin'};snapshot.data.people=[snapshot.user]; }
  else if(path==='/api/logout') snapshot.user=null;
  else if(path.startsWith('/api/items/')) {Object.assign(snapshot.data.items.find(item=>item.id===path.split('/').pop()),body);snapshot.revision++;}
  else if(path.startsWith('/api/rooms/') && options.method==='PATCH') {snapshot.data.rooms.find(room=>room.id===path.split('/').pop()).name=body.name;snapshot.revision++;}
  else if(path==='/api/actions') {
    const engine=w.createEngine(snapshot.data,snapshot.state);result=engine[body.action](...body.args);snapshot.state=engine.state;snapshot.revision++;
  }
  return {ok:true,status:200,json:async()=>({...clone(snapshot),...(result?{result:clone(result)}:{})})};
};
w.EZRoom=function(host,id,onSelect,options){this.select=()=>{};this.destroy=()=>{};this.setEditing=value=>w.editing=value;w.selectUnit=onSelect;};
w.eval(fs.readFileSync(root+'/shared/engine.js','utf8'));
w.eval(fs.readFileSync(root+'/shared/placement.js','utf8'));
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
 await w.eval(fs.readFileSync(root+'/prototype/app.js','utf8'));
 assert.equal(w.document.querySelector('.rooms a').textContent,'教具小屋');
 w.document.getElementById('account').click();
 assert.equal(w.document.getElementById('toggle-register').hidden,true);
 w.document.querySelector('[name=email]').value='admin@example.com';w.document.querySelector('[name=password]').value='test-password-long-enough';
 w.document.getElementById('account-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.equal(w.document.getElementById('manage-link').hidden,false);
 w.selectUnit('A1',null);
 assert.equal(w.document.querySelector('.item-info h3').childNodes[0].textContent,'<img src=x onerror=alert(1)>');
 assert.equal(w.document.querySelector('.item-info h3 img'),null);
 w.document.getElementById('arrange-toggle').click();
 assert.equal(w.document.querySelectorAll('.item-drop-zone').length,2);
 assert.ok(w.document.querySelector('[data-place-item]').style.left.includes('50%')); 
 const trays = Array.from(w.document.querySelectorAll('.item-drop-zone'));
 trays.forEach((tray,index)=>tray.getBoundingClientRect=()=>({left:0,top:index*210,width:300,height:200}));
 w.document.elementsFromPoint=(_x,y)=>[trays[y>210?1:0]];
 const dragged=w.document.querySelector('[data-place-item]');
 let capture=false;
 dragged.setPointerCapture=()=>{capture=true;};dragged.hasPointerCapture=()=>capture;dragged.releasePointerCapture=()=>{capture=false;};
 function pointer(type,x,y) { const event=new w.MouseEvent(type,{clientX:x,clientY:y,button:0,bubbles:true});Object.defineProperty(event,'pointerId',{value:1});dragged.dispatchEvent(event); }
 pointer('pointerdown',150,80);pointer('pointermove',180,280);pointer('pointerup',180,280);await tick();
 assert.equal(snapshot.data.items[0].layer,2);assert.equal(snapshot.data.items[0].x,.6);assert.equal(snapshot.data.items[0].y,.35);
 w.document.querySelector('[data-place-item]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));await tick();
 assert.equal(snapshot.data.items[0].x,.63);
 assert.equal(calls.at(-1).body.revision,1);
 rejectItemSave=true;
 w.document.querySelector('[data-place-item]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));await tick();
 assert.equal(snapshot.data.items[0].x,.63);assert.ok(w.document.getElementById('layout-status').textContent.includes('暫時無法儲存'));
 w.document.querySelector('[data-edit-asset]').click();
 const asset=w.document.querySelector('.asset-form');asset.querySelector('input').value='REH-TEACH-2026-0001';asset.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.equal(snapshot.data.items[0].assetNumber,'REH-TEACH-2026-0001');
 assert.equal(w.document.querySelector('.asset-number').textContent,'REH-TEACH-2026-0001');
 w.location.hash='#/manage/1';await tick();
 const rename=w.document.getElementById('rename-room-form');rename.elements.name.value='<script>alert(1)</script>房間';rename.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.equal(snapshot.data.rooms[0].name,'<script>alert(1)</script>房間');assert.equal(w.document.querySelector('.rooms a').textContent,'<script>alert(1)</script>房間');assert.equal(w.document.querySelector('.rooms script'),null);
 w.location.hash='#/qr';await tick();assert.equal(w.document.querySelectorAll('.qr-code img').length,2);assert.ok(w.document.querySelector('.qr-code img').src.includes('/api/qr.svg?text='));
 w.location.hash='#/numbering';await tick();assert.ok(w.document.getElementById('app').textContent.includes('REH-TEACH-2026-0001'));
 w.location.hash='#/borrow/A1';await tick();
 w.document.getElementById('check-a').checked=true;w.document.getElementById('end-a').value='2026-11-20';w.document.getElementById('end-a').dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(w.document.getElementById('borrow-submit').disabled,false);
 w.document.getElementById('borrow-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();assert.equal(snapshot.state.records.length,1);assert.equal(w.document.querySelector('h1').textContent,'借用／預約已完成');
});
