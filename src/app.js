'use strict';
(function(){
const VERSION='1.8.0';
const CAP=window.capacitorExports||null;
const NATIVE=!!(window.Capacitor&&typeof window.Capacitor.isNativePlatform==='function'&&window.Capacitor.isNativePlatform());
const P=NATIVE&&CAP?{geo:CAP.registerPlugin('BackgroundGeolocation'),tts:CAP.registerPlugin('TextToSpeech'),fs:CAP.registerPlugin('Filesystem'),share:CAP.registerPlugin('Share'),awake:CAP.registerPlugin('KeepAwake'),notif:CAP.registerPlugin('LocalNotifications'),app:CAP.registerPlugin('App')}:{};
const ANDROID=/Android/i.test(navigator.userAgent);
const IOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const STANDALONE=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
document.documentElement.classList.add(NATIVE?'native':'web');if(IOS)document.documentElement.classList.add('ios');
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);

/* ---------------- Stockage ---------------- */
const store={
  get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}},
  del(k){try{localStorage.removeItem(k)}catch(e){}}
};
const K={courses:'oguide.courses.v1',settings:'oguide.settings.v1',draft:'oguide.draft.v1',results:'oguide.results.v1',me:'oguide.me.v1',orgs:'oguide.orgs.v1',follow:'oguide.follow.v1',active:'oguide.active.v1'};
const DEFAULTS={uiMode:'ask',lastUi:'dv',profile:'blind',voiceMode:'app',interval:30,zoneInterval:15,dirFormat:'clock',headingRef:'auto',rate:1,beep:true,approachDist:50,stereo:false,radius:10,vibrate:true,layer:'ign',contrast:'high',mapStyle:'paths-light',showRoute:false,showMe:true,showDone:false,avgSeconds:5,recordTrack:true,sim:false,_v:3};
let settings=Object.assign({},DEFAULTS,store.get(K.settings,{}));
const saveSettings=()=>store.set(K.settings,settings);
if((settings._v||1)<2)Object.assign(settings,{approachDist:50,dirFormat:'clock',mapStyle:'paths-light',_v:2});
if(settings._v<3){Object.assign(settings,{headingRef:'auto',showRoute:false,_v:3});saveSettings()}
let courses=store.get(K.courses,[]);
function saveCourses(){if(!store.set(K.courses,courses))toast('Mémoire du navigateur indisponible : pense à exporter le GPX !',true)}
let results=store.get(K.results,[]);
function saveResults(){while(results.length>60)results.shift();if(!store.set(K.results,results)){results.forEach(r=>r.track=[]);store.set(K.results,results)}}

/* ---------------- Géographie ---------------- */
const RAD=Math.PI/180,RE=6371008.8;
function dist(a,b){const dLat=(b.lat-a.lat)*RAD,dLon=(b.lon-a.lon)*RAD;const x=Math.sin(dLat/2)**2+Math.cos(a.lat*RAD)*Math.cos(b.lat*RAD)*Math.sin(dLon/2)**2;return 2*RE*Math.asin(Math.min(1,Math.sqrt(x)))}
function bearing(a,b){const p1=a.lat*RAD,p2=b.lat*RAD,dl=(b.lon-a.lon)*RAD;const y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);return(Math.atan2(y,x)/RAD+360)%360}
function dest(p,brg,d){const dd=d/RE,t=brg*RAD,p1=p.lat*RAD,l1=p.lon*RAD;const p2=Math.asin(Math.sin(p1)*Math.cos(dd)+Math.cos(p1)*Math.sin(dd)*Math.cos(t));const l2=l1+Math.atan2(Math.sin(t)*Math.sin(dd)*Math.cos(p1),Math.cos(dd)-Math.sin(p1)*Math.sin(p2));return{lat:p2/RAD,lon:((l2/RAD+540)%360)-180}}
const CARD=['nord','nord-est','est','sud-est','sud','sud-ouest','ouest','nord-ouest'],CARDS=['N','NE','E','SE','S','SO','O','NO'];
const card=b=>CARD[Math.round(b/45)%8],cardS=b=>CARDS[Math.round(b/45)%8];
const clockOf=rel=>{const h=Math.round(rel/30)%12;return h===0?12:h};
const fmtDist=d=>d<1000?Math.round(d)+' m':(d/1000).toFixed(2).replace('.',',')+' km';
function spokenDist(d){if(d<10)return'moins de 10 mètres';if(d<100)return(Math.round(d/5)*5)+' mètres';if(d<1000)return(Math.round(d/10)*10)+' mètres';return(d/1000).toFixed(1).replace('.',',')+' kilomètres'}
function fmtTime(ms){const s=Math.max(0,Math.round(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),ss=s%60;return(h?h+':'+String(m).padStart(2,'0'):m)+':'+String(ss).padStart(2,'0')}
function spokenTime(ms){const s=Math.max(0,Math.round(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),ss=s%60,p=[];if(h)p.push(h+(h>1?' heures':' heure'));if(m)p.push(m+(m>1?' minutes':' minute'));if(ss||!p.length)p.push(ss+(ss>1?' secondes':' seconde'));return p.join(' ')}
function courseLength(pts){let L=0;for(let i=1;i<pts.length;i++)L+=dist(pts[i-1],pts[i]);return L}
const nControls=pts=>pts.filter(p=>p.type==='control').length;
function shortLabel(pts,i){const p=pts[i];if(p.type==='start')return'D';if(p.type==='finish')return'A';let n=0;for(let j=0;j<=i;j++)if(pts[j].type==='control')n++;return String(n)}
function slug(s){return(String(s||'parcours').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\w-]+/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'').slice(0,60))||'parcours'}

/* ---------------- Interface : toast, modale ---------------- */
let toastT;
function toast(msg,warn){const t=$('#toast');t.textContent=msg;t.className='show'+(warn?' warn':'');clearTimeout(toastT);toastT=setTimeout(()=>t.className='',warn?5000:3200)}
function modal({title,body='',buttons=[{label:'OK',value:true,primary:true}],input=null}){
  return new Promise(res=>{
    const m=$('#modal');$('#modalTitle').textContent=title;$('#modalBody').innerHTML=body;
    const inp=$('#modalInput');
    if(input){inp.hidden=false;inp.value=input.value||'';inp.placeholder=input.placeholder||''}else inp.hidden=true;
    const bx=$('#modalBtns');bx.innerHTML='';
    buttons.forEach(b=>{const el=document.createElement('button');el.type='button';el.textContent=b.label;if(b.primary)el.className='primary';if(b.danger)el.className='danger';
      el.onclick=()=>{m.classList.remove('show');res(input?{value:b.value,text:inp.value.trim()}:b.value)};bx.appendChild(el)});
    m.classList.add('show');
    setTimeout(()=>{if(input)inp.focus();else $('#modalTitle').focus()},60);
  });
}

/* ---------------- Son, voix, vibration, veille ---------------- */
const Snd={ctx:null,out:null,
  unlock(){
    try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch(e){}
    try{if(!this.ctx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;this.ctx=new AC();this.out=this.ctx.createGain();this.out.gain.value=0.9;this.out.connect(this.ctx.destination)}
      if(this.ctx.state!=='running')this.ctx.resume()}catch(e){}
  },
  tone(f,dur=0.09,{pan=0,vol=0.45,type='sine',at=0}={}){
    const c=this.ctx;if(!c)return;
    try{const t=c.currentTime+at,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=f;
      g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+0.012);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
      o.connect(g);let node=g;
      if(pan&&c.createStereoPanner){const p=c.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,pan));g.connect(p);node=p}
      node.connect(this.out);o.start(t);o.stop(t+dur+0.03)}catch(e){}
  },
  chime(){[784,988,1319].forEach((f,i)=>this.tone(f,0.24,{at:i*0.15,vol:0.5,type:'triangle'}))},
  fanfare(){[523,659,784,1047,784,1047].forEach((f,i)=>this.tone(f,0.28,{at:i*0.14,vol:0.5,type:'triangle'}))},
  warn(){this.tone(392,0.22,{vol:0.4,type:'square'});this.tone(262,0.3,{at:0.25,vol:0.4,type:'square'})},
  ok(){this.tone(1046,0.12,{vol:0.4,type:'triangle'})}
};
function vib(p){if(settings.vibrate&&navigator.vibrate)try{navigator.vibrate(p)}catch(e){}}

const Voice={v:null,log:[],
  pick(){try{const vs=speechSynthesis.getVoices().filter(v=>/^fr/i.test(v.lang));this.v=vs.find(v=>/fr[-_]FR/i.test(v.lang)&&v.localService)||vs.find(v=>/fr[-_]FR/i.test(v.lang))||vs[0]||null}catch(e){}},
  init(){if('speechSynthesis' in window){this.pick();try{speechSynthesis.addEventListener('voiceschanged',()=>this.pick())}catch(e){}}},
  unlock(){if(NATIVE)return;try{if('speechSynthesis' in window){const u=new SpeechSynthesisUtterance(' ');u.volume=0;speechSynthesis.speak(u)}}catch(e){}},
  _n:0,_speaking:false,
  say(text){
    this.log.push(text);if(this.log.length>200)this.log.shift();window.__spoken=this.log;
    if(settings.voiceMode==='sr'){const l=$('#live');l.textContent='';setTimeout(()=>l.textContent=text,40)}
    if(settings.voiceMode!=='app')return;
    if(NATIVE){const id=++this._n;this._speaking=true;
      P.tts.speak({text,lang:'fr-FR',rate:settings.rate,pitch:1,volume:1,queueStrategy:0}).catch(()=>{}).finally(()=>{if(id===this._n)this._speaking=false});return}
    if(!('speechSynthesis' in window))return;
    try{const u=new SpeechSynthesisUtterance(text);u.lang='fr-FR';if(this.v)u.voice=this.v;u.rate=settings.rate;u.volume=1;
      const go=()=>{try{speechSynthesis.resume();speechSynthesis.speak(u)}catch(e){}};
      if(speechSynthesis.speaking||speechSynthesis.pending){speechSynthesis.cancel();setTimeout(go,90)}else go();
    }catch(e){}
  },
  busy(){if(settings.voiceMode!=='app')return false;if(NATIVE)return this._speaking;try{return speechSynthesis.speaking}catch(e){return false}},
  stop(){if(NATIVE){this._n++;this._speaking=false;P.tts.stop().catch(()=>{});return}try{speechSynthesis.cancel()}catch(e){}}
};

const Wake={lock:null,want:false,
  async on(){this.want=true;if(NATIVE){P.awake.keepAwake().catch(()=>{});return}try{if('wakeLock' in navigator&&!this.lock){this.lock=await navigator.wakeLock.request('screen');this.lock.addEventListener('release',()=>{this.lock=null})}}catch(e){}},
  off(){this.want=false;if(NATIVE){P.awake.allowSleep().catch(()=>{});return}try{if(this.lock)this.lock.release()}catch(e){}this.lock=null}
};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(Wake.want&&!NATIVE)Wake.on();if(current==='run'&&!NATIVE)Run.onResumeVisible();if(current==='run')Run.publish(true);if(current==='follow')Follow.onResumeVisible()}});

/* ---------------- GPS ---------------- */
const GPS={id:null,last:null,lastErrT:0,subs:new Set(),simPos:null,simTimer:null,simHead:null,simMoveT:0,
  nid:null,active:false,
  start(){
    if(settings.sim){this._startSim();return}
    if(NATIVE){this.active=true;if(this.nid===null&&!this.starting)this._nativeStart();return}
    if(this.id!==null)return;
    if(!('geolocation' in navigator)){toast('Pas de GPS disponible dans ce navigateur',true);return}
    this.id=navigator.geolocation.watchPosition(p=>{const c=p.coords;
      this._emit({lat:c.latitude,lon:c.longitude,acc:c.accuracy||99,heading:(c.heading==null||isNaN(c.heading))?null:c.heading,speed:c.speed,t:Date.now()})},
      e=>{if(e.code!==1)this.lastErrT=Date.now();if(e.code===1){toast('Accès à la position refusé : autorise la localisation pour ce site dans le navigateur.',true);Voice.say('Accès à la position refusé.')}},
      {enableHighAccuracy:true,maximumAge:0,timeout:30000});
  },
  async _nativeStart(){
    this.starting=true;
    try{
      await ensureNotifPermission();
      const id=await P.geo.addWatcher({backgroundTitle:"O'Guide – GPS actif",backgroundMessage:"Le guidage continue même écran verrouillé. Touchez pour revenir à l'appli.",requestPermissions:true,stale:false,distanceFilter:0},
        (loc,err)=>{
          if(err){if(err.code==='NOT_AUTHORIZED')askLocationSettings();else this.lastErrT=Date.now();return}
          if(!loc)return;
          this._emit({lat:loc.latitude,lon:loc.longitude,acc:loc.accuracy||99,heading:(loc.bearing==null||isNaN(loc.bearing))?null:loc.bearing,speed:loc.speed,t:Date.now()});
        });
      if(this.active)this.nid=id;else P.geo.removeWatcher({id}).catch(()=>{});
    }catch(e){toast('GPS indisponible : '+((e&&e.message)||e),true)}
    finally{this.starting=false}
  },
  stop(){
    this.active=false;
    if(this.nid!==null){P.geo.removeWatcher({id:this.nid}).catch(()=>{});this.nid=null}
    if(this.id!==null){try{navigator.geolocation.clearWatch(this.id)}catch(e){}this.id=null}clearInterval(this.simTimer);this.simTimer=null},
  restart(){this.stop();this.start()},
  _startSim(){if(this.simTimer)return;if(!this.simPos)this.simPos=this.last?{lat:this.last.lat,lon:this.last.lon}:{lat:43.9493,lon:4.8055};this.simTimer=setInterval(()=>this._emitSim(),1000);this._emitSim()},
  _emitSim(){const moving=Date.now()-this.simMoveT<4000;this._emit({lat:this.simPos.lat,lon:this.simPos.lon,acc:3,heading:moving?this.simHead:null,speed:moving?1.2:0,t:Date.now(),sim:true})},
  simSet(lat,lon){if(this.simPos)this.simHead=bearing(this.simPos,{lat,lon});this.simMoveT=Date.now();this.simPos={lat,lon};if(this.simTimer)this._emitSim()},
  simMove(brg,d){if(!this.simPos)return;const p=dest(this.simPos,brg,d);this.simSet(p.lat,p.lon)},
  _emit(f){this.last=f;this.subs.forEach(fn=>{try{fn(f)}catch(e){console.error(e)}})},
  on(fn){this.subs.add(fn);return()=>this.subs.delete(fn)}
};
async function ensureNotifPermission(){
  if(!NATIVE||ensureNotifPermission.done)return;ensureNotifPermission.done=true;
  try{const s=await P.notif.checkPermissions();if(s.display!=='granted')await P.notif.requestPermissions()}catch(e){}
}
let locAsked=false;
async function askLocationSettings(){
  if(locAsked)return;locAsked=true;Voice.say('Accès à la position refusé.');
  const v=await modal({title:'Localisation refusée',body:"<p>O'Guide a besoin de la position GPS. Autorise la localisation « précise » dans les réglages de l'appli.</p>",buttons:[{label:'Ouvrir les réglages',value:true,primary:true},{label:'Plus tard',value:false}]});
  if(v)P.geo.openSettings().catch(()=>{});setTimeout(()=>locAsked=false,30000);
}
function gpsBadge(el,f){
  if(!f){el.className='gps none';el.textContent='GPS : recherche…';return}
  const a=Math.round(f.acc);el.className='gps '+(a<=8?'good':a<=20?'mid':'bad');el.textContent=(f.sim?'SIMU ':'GPS ')+'±'+a+' m';
}

/* ---------------- Boussole ---------------- */
function tiltHeading(a,b,g){
  /* cap horizontal de l'axe « haut du téléphone » + « dos du téléphone » : juste à plat comme tenu debout */
  a*=RAD;b*=RAD;g*=RAD;const ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),cg=Math.cos(g),sg=Math.sin(g);
  const E=-sa*cb-ca*sg-sa*sb*cg,N=ca*cb-sa*sg+ca*sb*cg;
  if(Math.hypot(E,N)<0.25)return null;return(Math.atan2(E,N)/RAD+360)%360;
}
const Compass={active:false,x:0,y:0,val:null,lastT:0,onChange:null,_thr:0,
  /* autorisation explicite seulement sur iPhone/iPad (Chrome expose aussi requestPermission mais n'en a pas besoin) */
  needsPerm:typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'&&!('ondeviceorientationabsolute' in window),
  async enable(){
    if(this.active)return true;
    try{
      if(this.needsPerm){const r=await DeviceOrientationEvent.requestPermission();if(r!=='granted')return false}
      if('ondeviceorientationabsolute' in window)window.addEventListener('deviceorientationabsolute',this._abs,true);
      if('DeviceOrientationEvent' in window)window.addEventListener('deviceorientation',this._ios,true);
      this.active=true;return true;
    }catch(e){return false}
  },
  _scr(){try{return(screen.orientation&&screen.orientation.angle)||window.orientation||0}catch(e){return 0}},
  _tilt(e){if(e.beta!=null){this.beta=e.beta;this.gamma=e.gamma||0;this.btT=Date.now()}},
  flat(){return this.active&&Date.now()-(this.btT||0)<2000&&Math.abs(this.beta)<35&&Math.abs(this.gamma)<35},
  _ios(e){if(e.webkitCompassHeading!=null){Compass._tilt(e);Compass._set(e.webkitCompassHeading+Compass._scr());return}
    if(e.absolute&&!('ondeviceorientationabsolute' in window))Compass._abs(e)},
  _abs(e){if(e.alpha==null)return;if(e.type==='deviceorientation'&&!e.absolute)return;Compass._tilt(e);const h=tiltHeading(e.alpha,e.beta||0,e.gamma||0);if(h!=null)Compass._set(h+Compass._scr())},
  _set(h){h=((h%360)+360)%360;const now=Date.now(),dt=this.val==null?1:Math.min(1,Math.max(0.005,(now-this.lastT)/1000)),k=1-Math.exp(-dt/0.3);
    this.x=this.x*(1-k)+Math.cos(h*RAD)*k;this.y=this.y*(1-k)+Math.sin(h*RAD)*k;
    this.val=(Math.atan2(this.y,this.x)/RAD+360)%360;this.lastT=Date.now();
    if(this.onChange&&Date.now()-this._thr>150){this._thr=Date.now();this.onChange(this.val)}},
  get(){return(this.active&&Date.now()-this.lastT<3000)?this.val:null}
};
const Walk={h:null,t:0,movT:0,hist:[],
  update(f){
    const H=this.hist;H.push(f);while(H.length>40)H.shift();
    /* en mouvement ? vitesse GPS, ou déplacement réel sur les 5 à 12 dernières secondes */
    let moving=f.speed!=null&&f.speed>0.7;
    if(!moving)for(let i=H.length-2;i>=0;i--){const dt=(f.t-H[i].t)/1000;if(dt>=5){const d=dist(H[i],f);moving=dt<=12&&d/dt>0.6&&d>Math.max(4,f.acc*0.7);break}}
    if(moving)this.movT=Date.now();
    if(f.heading!=null&&f.speed>0.6){this.h=f.heading;this.t=Date.now();return}
    for(let i=H.length-2;i>=0;i--){const d=dist(H[i],f);if(d>=8){if(f.t-H[i].t<25000&&d>Math.max(6,f.acc*0.8)){this.h=bearing(H[i],f);this.t=Date.now()}break}}
  },
  moving(){return Date.now()-this.movT<3500},
  get(maxAge=15000){return this.h!=null&&Date.now()-this.t<maxAge?this.h:null}
};
GPS.on(f=>Walk.update(f));
/* Direction de référence (12 h = devant)
   - mixte (défaut) : en marche → sens de déplacement ; à l'arrêt, écran allumé et téléphone à plat → boussole ;
     à l'arrêt, écran éteint ou téléphone vertical → dernier sens de déplacement
   - boussole : toujours la boussole (sauf écran éteint / mode poche)
   - déplacement : toujours le sens de déplacement */
function currentHeading(){
  const mode=settings.headingRef||'auto',screenOff=Lock.on||document.visibilityState==='hidden';
  const comp=()=>{const c=Compass.get();return c!=null?{h:c,src:'boussole'}:null};
  const walk=age=>{const w=Walk.get(age);return w!=null?{h:w,src:'marche'}:null};
  if(mode==='walk'||screenOff)return walk(600000);
  if(mode==='phone')return comp()||walk(15000);
  if(Walk.moving())return walk(15000)||comp();
  if(Compass.flat())return comp()||walk(600000);
  return walk(600000)||comp();
}

/* ---------------- Carte ---------------- */
const IGN=l=>`https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${l}&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
const LAYERS={
  osm:{url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',o:{maxNativeZoom:19,maxZoom:20,attribution:'© OpenStreetMap'}},
  ign:{url:IGN('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2')+'&FORMAT=image/png',o:{maxNativeZoom:19,maxZoom:20,attribution:'© IGN Géoplateforme'}},
  topo:{url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',o:{subdomains:'abc',maxNativeZoom:17,maxZoom:20,attribution:'© OpenStreetMap, SRTM | OpenTopoMap (CC-BY-SA)'}},
  photo:{url:IGN('ORTHOIMAGERY.ORTHOPHOTOS')+'&FORMAT=image/jpeg',o:{maxNativeZoom:19,maxZoom:20,attribution:'© IGN Géoplateforme'}}
};
const allMaps=[];
function makeMap(el,kind){const m=L.map(el,{zoomControl:true,attributionControl:true,maxZoom:20});m._kind=kind||'map';m.createPane('paths').style.zIndex=350;
  m.attributionControl.setPrefix(false);m.setView([43.9493,4.8055],15);setMapStyle(m);allMaps.push(m);return m}
const mapStyleOf=m=>(m._kind==='create'||m._kind==='org')?'map':settings.mapStyle;
function setMapStyle(m){
  const st=mapStyleOf(m),c=m.getContainer();c.classList.remove('ct-normal','ct-high','ct-invert','ms-light','ms-dark');
  if(m._base){m.removeLayer(m._base);m._base=null}
  if(st==='paths-dark'){c.classList.add('ms-dark');return}
  const ly=LAYERS[(m._kind==='org'&&settings.orgLayer)||settings.layer]||LAYERS.osm;m._base=L.tileLayer(ly.url,ly.o).addTo(m);
  c.classList.add(st==='paths-light'?'ms-light':'ct-'+(m._kind==='org'?'normal':settings.contrast));
}
function ctrlIcon(pts,i,{size=40,cls=''}={}){
  const p=pts[i],s=size;let svg;
  if(p.type==='start')svg=`<svg viewBox="0 0 40 40" width="${s}" height="${s}"><polygon points="20,3 38,35 2,35" fill="rgba(255,255,255,.7)" stroke="#FF2BD6" stroke-width="5" stroke-linejoin="round"/></svg>`;
  else if(p.type==='finish')svg=`<svg viewBox="0 0 40 40" width="${s}" height="${s}"><circle cx="20" cy="20" r="17" fill="rgba(255,255,255,.7)" stroke="#FF2BD6" stroke-width="4"/><circle cx="20" cy="20" r="9" fill="none" stroke="#FF2BD6" stroke-width="4"/></svg>`;
  else svg=`<svg viewBox="0 0 40 40" width="${s}" height="${s}"><circle cx="20" cy="20" r="16" fill="rgba(255,255,255,.88)" stroke="#FF2BD6" stroke-width="5"/><text x="20" y="26.5" text-anchor="middle" font-size="18" font-weight="700" font-family="Atkinson,sans-serif" fill="#000">${shortLabel(pts,i)}</text></svg>`;
  return L.divIcon({html:svg,className:'mk '+cls,iconSize:[s,s],iconAnchor:[s/2,s/2]});
}
const targetIcon=lbl=>L.divIcon({className:'mk-target',html:`<div class="tg">${esc(lbl)}</div>`,iconSize:[64,64],iconAnchor:[32,32]});
function meIcon(h){
  const arrow=h!=null?`<polygon points="35,1 46,24 24,24" fill="#00E5FF" stroke="#000" stroke-width="3" stroke-linejoin="round"/>`:'';
  return L.divIcon({className:'me',html:`<svg width="70" height="70" viewBox="0 0 70 70" style="transform:rotate(${h||0}deg)">${arrow}<circle cx="35" cy="35" r="13" fill="#00E5FF" stroke="#000" stroke-width="5"/><circle cx="35" cy="35" r="17" fill="none" stroke="#fff" stroke-width="3"/></svg>`,iconSize:[70,70],iconAnchor:[35,35]});
}
function simPad(el,extra){
  el.innerHTML='';const mk=(lbl,fn,aria)=>{const b=document.createElement('button');b.type='button';b.textContent=lbl;if(aria)b.setAttribute('aria-label',aria);b.onclick=fn;el.appendChild(b)};
  mk('↑ N',()=>GPS.simMove(0,5),'Simulation : 5 mètres vers le nord');mk('← O',()=>GPS.simMove(270,5),'5 mètres vers l\'ouest');mk('→ E',()=>GPS.simMove(90,5),'5 mètres vers l\'est');mk('↓ S',()=>GPS.simMove(180,5),'5 mètres vers le sud');
  (extra||[]).forEach(x=>mk(x[0],x[1]));
}

/* ---------------- Chemins OpenStreetMap & itinéraire ---------------- */
const OVERPASS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
function pathClass(t){
  const h=t.highway;if(!h)return null;
  if(/^(proposed|construction|platform|elevator|bus_stop|corridor|raceway|abandoned|razed|services|rest_area|busway|bus_guideway|escape|via_ferrata)$/.test(h))return null;
  if(t.access==='private'||t.access==='no'||t.foot==='no'||t.foot==='private')return null;
  if(h==='steps')return's';
  if(/^(track|path|footway|cycleway|bridleway|pedestrian)$/.test(h))return'p';
  if(/^(motorway|motorway_link|trunk|trunk_link)$/.test(h))return'm';
  if(/^(primary|primary_link|secondary|secondary_link|tertiary|tertiary_link)$/.test(h))return'r';
  return'l';
}
const Paths={mem:{},graphs:{},
  key:id=>'oguide.paths.'+id,
  get(id){if(this.mem[id])return this.mem[id];const d=store.get(this.key(id),null);if(d)this.mem[id]=d;return d},
  bbox(pts,m=400){let s=90,w=180,n=-90,e=-180;pts.forEach(p=>{s=Math.min(s,p.lat);n=Math.max(n,p.lat);w=Math.min(w,p.lon);e=Math.max(e,p.lon)});
    const dLat=m/111320,dLon=m/(111320*Math.cos((s+n)/2*RAD));return{s:+(s-dLat).toFixed(5),w:+(w-dLon).toFixed(5),n:+(n+dLat).toFixed(5),e:+(e+dLon).toFixed(5)}},
  async fetch(c){
    const b=this.bbox(c.points),q=`[out:json][timeout:40];way["highway"](${b.s},${b.w},${b.n},${b.e});out body;>;out skel qt;`;
    let last;
    for(const ep of OVERPASS){
      try{
        const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),45000);
        const r=await fetch(ep,{method:'POST',body:'data='+encodeURIComponent(q),headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:ctl.signal});
        clearTimeout(tm);if(!r.ok)throw new Error('serveur indisponible ('+r.status+')');
        const data=this.compact(await r.json(),b);
        if(!data.ways.length)throw new Error('aucun chemin dans la zone');
        this.mem[c.id]=data;delete this.graphs[c.id];
        if(!store.set(this.key(c.id),data))toast('Chemins chargés, mais trop volumineux pour être gardés hors connexion.',true);
        return data;
      }catch(e){last=e&&e.name==='AbortError'?new Error('serveur trop lent'):e instanceof TypeError?new Error('pas de connexion internet'):e}
    }
    throw last||new Error('pas de connexion internet');
  },
  compact(j,b){const idx=new Map(),nodes=[],ways=[];
    for(const el of j.elements||[])if(el.type==='node'){idx.set(el.id,nodes.length);nodes.push([+el.lat.toFixed(6),+el.lon.toFixed(6)])}
    for(const el of j.elements||[])if(el.type==='way'&&el.nodes){const c=pathClass(el.tags||{});if(!c)continue;const n=el.nodes.map(i=>idx.get(i)).filter(i=>i!=null);if(n.length>1)ways.push({c,n})}
    return{v:1,fetched:new Date().toISOString(),bbox:b,nodes,ways}},
  async ensure(c,{quiet}={}){
    const have=this.get(c.id);if(have)return have;
    if(!quiet)toast('Téléchargement des chemins…');
    try{const d=await this.fetch(c);if(!quiet)toast(`Chemins enregistrés (${d.ways.length} tronçons), utilisables hors connexion`);return d}
    catch(e){if(!quiet)toast('Chemins indisponibles : '+e.message+'. Réessaie avec du réseau.',true);return null}
  },
  del(id){delete this.mem[id];delete this.graphs[id];store.del(this.key(id))},
  graph(id){if(this.graphs[id])return this.graphs[id];const d=this.get(id);if(!d)return null;return this.graphs[id]=Router.build(d)}
};
class Heap{constructor(){this.k=[];this.p=[]}get size(){return this.k.length}
  push(k,p){const K=this.k,P=this.p;K.push(k);P.push(p);let i=K.length-1;while(i>0){const j=(i-1)>>1;if(P[j]<=P[i])break;[K[i],K[j]]=[K[j],K[i]];[P[i],P[j]]=[P[j],P[i]];i=j}}
  pop(){const K=this.k,P=this.p,top=K[0],lk=K.pop(),lp=P.pop();if(K.length){K[0]=lk;P[0]=lp;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<K.length&&P[l]<P[m])m=l;if(r<K.length&&P[r]<P[m])m=r;if(m===i)break;[K[i],K[m]]=[K[m],K[i]];[P[i],P[m]]=[P[m],P[i]];i=m}}return top}}
/* coût par type : sentiers préférés, grandes routes évitées, escaliers pénalisés, voies rapides exclues */
const COST={p:1,l:1.15,r:1.8,s:3};
const Router={
  build(d){
    const N=d.nodes.length,adj=Array.from({length:N},()=>[]),segs=[],P=i=>({lat:d.nodes[i][0],lon:d.nodes[i][1]});
    d.ways.forEach(w=>{const f=COST[w.c];if(!f)return;
      for(let i=1;i<w.n.length;i++){const a=w.n[i-1],b=w.n[i];if(a===b)continue;const L0=dist(P(a),P(b));adj[a].push(b,L0*f);adj[b].push(a,L0*f);segs.push(a,b,f)}});
    return{d,N,adj,segs,P};
  },
  snap(g,p){
    const kx=111320*Math.cos(p.lat*RAD),ky=111320,nd=g.d.nodes;let best=null;
    for(let i=0;i<g.segs.length;i+=3){const a=g.segs[i],b=g.segs[i+1];
      const ax=(nd[a][1]-p.lon)*kx,ay=(nd[a][0]-p.lat)*ky,dx=(nd[b][1]-nd[a][1])*kx,dy=(nd[b][0]-nd[a][0])*ky,L2=dx*dx+dy*dy;
      const t=L2?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/L2)):0,x=ax+t*dx,y=ay+t*dy,dd=x*x+y*y;
      if(!best||dd<best.dd)best={a,b,t,f:g.segs[i+2],dd,lat:p.lat+y/ky,lon:p.lon+x/kx}}
    if(best)best.d=Math.sqrt(best.dd);return best;
  },
  route(g,from,to){
    const s=this.snap(g,from),e=this.snap(g,to);if(!s||!e||s.d>150)return null;
    const N=g.N,S=N,E=N+1,ex=new Map(),add=(u,v,w)=>{if(!ex.has(u))ex.set(u,[]);ex.get(u).push(v,w)};
    const sl=dist(g.P(s.a),g.P(s.b)),el=dist(g.P(e.a),g.P(e.b));
    add(S,s.a,sl*s.t*s.f);add(S,s.b,sl*(1-s.t)*s.f);add(e.a,E,el*e.t*e.f);add(e.b,E,el*(1-e.t)*e.f);
    if((s.a===e.a&&s.b===e.b)||(s.a===e.b&&s.b===e.a)){const te=s.a===e.a?e.t:1-e.t;add(S,E,sl*Math.abs(te-s.t)*s.f)}
    const goal={lat:e.lat,lon:e.lon},hh=i=>i===E?0:dist(i===S?s:g.P(i),goal);
    const gs=new Map([[S,0]]),prev=new Map(),done=new Set(),H=new Heap();H.push(S,hh(S));
    while(H.size){const u=H.pop();if(u===E)break;if(done.has(u))continue;done.add(u);const gu=gs.get(u);
      const relax=(v,w)=>{const nv=gu+w;if(nv<(gs.has(v)?gs.get(v):Infinity)){gs.set(v,nv);prev.set(v,u);H.push(v,nv+hh(v))}};
      if(u<N){const a=g.adj[u];for(let k=0;k<a.length;k+=2)relax(a[k],a[k+1])}
      const x=ex.get(u);if(x)for(let k=0;k<x.length;k+=2)relax(x[k],x[k+1]);
      if(done.size>300000)break}
    if(!prev.has(E))return null;
    const ids=[];for(let v=E;v!==undefined;v=prev.get(v)){ids.push(v);if(v===S)break}ids.reverse();
    const coords=ids.map(v=>v===S?[s.lat,s.lon]:v===E?[e.lat,e.lon]:g.d.nodes[v]);
    let len=0;for(let i=1;i<coords.length;i++)len+=dist({lat:coords[i-1][0],lon:coords[i-1][1]},{lat:coords[i][0],lon:coords[i][1]});
    return{coords,len,offStart:s.d,offEnd:e.d,total:len+s.d+e.d};
  }
};
const PATH_STYLE={
  'paths-light':{col:{m:'#6f6f6f',r:'#A00000',l:'#E00000',p:'#E00000',s:'#E00000'},w:{m:12,r:11,l:9,p:6,s:6},casing:'#FFFFFF',route:'#0040FF',routeCase:'#FFFFFF'},
  'paths-dark':{col:{m:'#8a8a8a',r:'#D8D8D8',l:'#FFFFFF',p:'#FFFFFF',s:'#FFFFFF'},w:{m:12,r:11,l:8,p:5,s:5},casing:null,route:'#FFD400',routeCase:'#000000'},
  'map':{route:'#0040FF',routeCase:'#FFFFFF'}
};
function drawPaths(layer,data,style){
  layer.clearLayers();const st=PATH_STYLE[style];if(!data||!st||!st.col)return;
  const groups={};data.ways.forEach(w=>{(groups[w.c]=groups[w.c]||[]).push(w.n.map(i=>data.nodes[i]))});
  const order=['m','r','l','p','s'],o={pane:'paths',interactive:false,lineJoin:'round'};let first=true;
  if(st.casing)order.forEach(c=>{if(groups[c])L.polyline(groups[c],Object.assign({},o,{color:st.casing,weight:st.w[c]+4,lineCap:'round'})).addTo(layer)});
  order.forEach(c=>{if(!groups[c])return;L.polyline(groups[c],Object.assign({},o,{color:st.col[c],weight:st.w[c],dashArray:c==='s'?'3 7':null,lineCap:c==='s'?'butt':'round'},first?{attribution:'Chemins © OpenStreetMap'}:{})).addTo(layer);first=false});
}

/* ---------------- GPX ---------------- */
const SYM={start:'Flag, Green',control:'Flag, Red',finish:'Flag, Blue'};
function courseToGPX(c){
  const x=esc,t=p=>`<name>${x(p.name)}</name>${p.desc?`<desc>${x(p.desc)}</desc>`:''}`;
  let o=`<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="O'Guide ${VERSION}" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">\n`;
  o+=`<metadata><name>${x(c.name)}</name><desc>Parcours d'orientation : ${nControls(c.points)} balises</desc><time>${c.created||new Date().toISOString()}</time></metadata>\n`;
  c.points.forEach(p=>{o+=`<wpt lat="${p.lat}" lon="${p.lon}">${t(p)}<sym>${SYM[p.type]}</sym><type>${p.type}</type></wpt>\n`});
  o+=`<rte><name>${x(c.name)}</name>\n`;
  c.points.forEach(p=>{o+=`<rtept lat="${p.lat}" lon="${p.lon}">${t(p)}<type>${p.type}</type></rtept>\n`});
  o+=`</rte>\n`;
  if(c.track&&c.track.length>1){o+=`<trk><name>Trace de création</name><trkseg>\n`;c.track.forEach(q=>{o+=`<trkpt lat="${q[0]}" lon="${q[1]}">${q[2]?`<time>${new Date(q[2]).toISOString()}</time>`:''}</trkpt>\n`});o+=`</trkseg></trk>\n`}
  return o+'</gpx>\n';
}
function normType(type,name){
  const s=((type||'')+' '+(name||'')).toLowerCase();
  if(/\bstart\b|d[ée]part/.test(s))return'start';
  if(/\bfinish\b|\bend\b|arriv[ée]e/.test(s))return'finish';
  return'control';
}
function parseGPX(text,fileName){
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.getElementsByTagName('parsererror').length||!doc.documentElement||doc.documentElement.localName!=='gpx')throw new Error('Ce fichier n\'est pas un GPX lisible.');
  const q=(el,tag)=>[...el.getElementsByTagNameNS('*',tag)];
  const kid=(el,tag)=>{for(const n of el.children)if(n.localName===tag)return n.textContent.trim();return''};
  const meta=q(doc,'metadata')[0];
  let nodes=[];const rte=q(doc,'rte')[0];
  if(rte&&q(rte,'rtept').length>=2)nodes=q(rte,'rtept');else nodes=q(doc,'wpt');
  let pts=nodes.map(n=>({lat:parseFloat(n.getAttribute('lat')),lon:parseFloat(n.getAttribute('lon')),name:kid(n,'name'),desc:kid(n,'desc')||kid(n,'cmt'),rawType:kid(n,'type')}))
    .filter(p=>isFinite(p.lat)&&isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180);
  if(!pts.length)throw new Error('Aucune balise trouvée : le GPX doit contenir des points (wpt) ou une route (rte).');
  pts.forEach(p=>{p.type=normType(p.rawType,p.name);delete p.rawType});
  let si=pts.findIndex(p=>p.type==='start');pts.forEach((p,i)=>{if(p.type==='start'&&i!==si)p.type='control'});
  if(si>0)pts.unshift(pts.splice(si,1)[0]);
  let fi=-1;pts.forEach((p,i)=>{if(p.type==='finish')fi=i});pts.forEach((p,i)=>{if(p.type==='finish'&&i!==fi)p.type='control'});
  if(fi>=0&&fi!==pts.length-1)pts.push(pts.splice(fi,1)[0]);
  let n=0;pts.forEach(p=>{if(p.type==='control'){n++;if(!p.name)p.name='Balise '+n}else if(!p.name)p.name=p.type==='start'?'Départ':'Arrivée';p.id=uid()});
  const trk=q(doc,'trk')[0];let track=[];
  if(trk)track=q(trk,'trkpt').slice(0,20000).map(t=>[+t.getAttribute('lat'),+t.getAttribute('lon'),Date.parse(kid(t,'time'))||0]).filter(t=>isFinite(t[0])&&isFinite(t[1]));
  const name=(meta&&kid(meta,'name'))||(rte&&kid(rte,'name'))||String(fileName||'Parcours importé').replace(/\.gpx$/i,'');
  return{id:uid(),name,created:new Date().toISOString(),imported:true,points:pts,track};
}
function resultToGPX(r){
  const x=esc;let o=`<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="O'Guide ${VERSION}" xmlns="http://www.topografix.com/GPX/1/1">\n`;
  o+=`<metadata><name>${x('Résultat – '+r.courseName+(r.participant?' – '+r.participant:''))}</name><desc>${x('Temps total '+fmtTime(r.total))}</desc><time>${r.date}</time></metadata>\n`;
  r.splits.forEach(s=>{if(s.lat==null)return;o+=`<wpt lat="${s.lat}" lon="${s.lon}"><time>${s.time}</time><name>${x(s.name+' – '+fmtTime(s.elapsed))}</name><desc>${x(`Intermédiaire ${fmtTime(s.leg)} · validation ${s.mode==='auto'?'automatique':s.mode==='manual'?'manuelle':'passée'}`)}</desc><type>${s.mode}</type></wpt>\n`});
  if(r.track&&r.track.length>1){o+=`<trk><name>${x('Trace '+(r.participant||'participant'))}</name><trkseg>\n`;r.track.forEach(q=>{o+=`<trkpt lat="${q[0]}" lon="${q[1]}"><time>${new Date(q[2]).toISOString()}</time></trkpt>\n`});o+=`</trkseg></trk>\n`}
  return o+'</gpx>\n';
}
function download(name,text,mime){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:mime}));a.download=name;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},5000);
}
async function nativeWrite(directory,path,text){const r=await P.fs.writeFile({path,data:text,directory,encoding:'utf8',recursive:true});return r.uri}
async function saveFile(name,text,mime){
  if(!NATIVE){download(name,text,mime||'application/gpx+xml');toast((/csv/.test(mime||'')?'Fichier CSV':'GPX')+' téléchargé');return}
  try{await nativeWrite('DOCUMENTS','OGuide/'+name,text);toast('Enregistré dans Documents › OGuide : '+name)}
  catch(e){toast('Enregistrement impossible ici : utilise « Partager ».',true)}
}
async function shareFile(name,text){
  if(NATIVE){
    try{const uri=await nativeWrite('CACHE',name,text);await P.share.share({title:name,files:[uri],dialogTitle:'Envoyer '+name})}
    catch(e){if(!/cancel/i.test(String((e&&e.message)||e)))toast('Partage impossible : '+((e&&e.message)||e),true)}
    return;
  }
  for(const type of['application/gpx+xml','text/plain']){
    try{const f=new File([text],name,{type});if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:name});return}}
    catch(e){if(e&&e.name==='AbortError')return}
  }
  download(name,text,'application/gpx+xml');
  toast('Partage direct non disponible : fichier enregistré dans Téléchargements, à envoyer par mail ou messagerie.',true);
}

/* ---------------- Navigation ---------------- */
let current='home';
const PARENT={create:'home',library:'home',detail:'library',setup:'home',results:'home',help:'home',run:'home',join:'home',orgsetup:'detail',org:'home',follow:'home',history:'home',welcome:'home'};
const leaveHooks={create:()=>Create.close(),detail:()=>Lib.leaveDetail(),org:()=>Org.leave(),join:()=>Join.leave()};
function show(id){
  if(id===current)return;
  if(leaveHooks[current])leaveHooks[current]();
  $$('.screen').forEach(s=>s.classList.toggle('active',s.id===id));
  const prev=current;current=id;window.scrollTo(0,0);
  if(id!=='home'&&prev==='home')try{history.pushState({s:id},'')}catch(e){}
  const h=$('#'+id+' h1');if(h)setTimeout(()=>h.focus({preventScroll:true}),30);
  if(id==='home')Home.render();
  if(id==='history')History.render();
}
function goParent(){const par=PARENT[current]||'home';if(par==='library')Lib.open();else show(par)}
window.addEventListener('popstate',()=>{
  if(current==='home')return;
  try{history.pushState({s:current},'')}catch(e){}
  if(Sheet.open){Sheet.hide();return}
  if(current==='run'){if(RunOpts.open)RunOpts.hide();else if(!Lock.on)Run.askQuit();return}
  if(current==='follow'&&Follow.on){toast('Le suivi continue. Pour l\'arrêter : appui long sur « Arrêter le suivi ».');Voice.say('Le suivi continue.');return}
  if(current==='orgsetup'&&Lib.cur){Lib.openDetail(Lib.cur.id);return}
  if(current==='create'){Create.askBack();return}
  if(current==='setup'){Setup.back();return}
  goParent();
});
document.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b){const g=b.dataset.go;if(g==='back')goParent();else if(g==='library')Lib.open();else show(g)}});

/* ---------------- Interface : grands boutons (déficience visuelle) ou compacte (accompagnant) ---------------- */
const uiNow=()=>settings.uiMode==='acc'||settings.uiMode==='dv'?settings.uiMode:(settings.lastUi==='acc'?'acc':'dv');
function applyUi(){const m=uiNow();document.body.classList.toggle('ui-acc',m==='acc');document.body.classList.toggle('ui-dv',m!=='acc');
  const t=$('#hUiTxt');if(t)t.textContent=m==='acc'?'Grands boutons':'Interface compacte'}
const Welcome={
  ask(){return new Promise(res=>{
    this.done=res;show('welcome');$('#wRemember').checked=false;
    const last=uiNow();$('#wDv').classList.toggle('primary',last!=='acc');$('#wAcc').classList.toggle('primary',last==='acc');
    setTimeout(()=>Voice.say('O\'Guide. Qui utilise les menus ? En haut de l\'écran : déficience visuelle, grands boutons. En bas : avec un accompagnant. Le guidage de l\'épreuve reste vocal dans les deux cas.'),400);
  })},
  pick(m){settings.lastUi=m;if($('#wRemember').checked)settings.uiMode=m;saveSettings();applyUi();Voice.stop&&Voice.stop();
    Voice.say(m==='acc'?'Interface avec accompagnant. Le guidage reste vocal.':'Interface grands boutons.');show('home');const f=this.done;this.done=null;if(f)f(m)}
};
$('#wDv').onclick=()=>Welcome.pick('dv');
$('#wAcc').onclick=()=>Welcome.pick('acc');
function applySimUI(){$('#simBanner').hidden=!settings.sim;document.body.classList.toggle('sim',!!settings.sim)}

/* ---------------- Accueil ---------------- */
const orgOngoing=o=>o.status!=='closed'&&o.status!=='deleted'&&Date.now()-new Date(o.created).getTime()<3*86400000;
const orgRow=o=>`<button type="button" class="hitem" data-org="${o.code}"><span class="hi" aria-hidden="true">${o.kind==='train'?'📍':'📡'}</span><span class="ht"><b>${esc(o.name)}</b><small>${o.coorg?'👥 co-organisée · ':''}${Org.statusLabel(o.status,o.kind)} · ${new Date(o.created).toLocaleDateString('fr-FR')}</small></span><span class="go" aria-hidden="true">›</span></button>`;
const Home={deferred:null,
  render(){
    PARENT.org='home';PARENT.results='home';
    $('#hCount').textContent=courses.length?courses.length+' parcours':'aucun pour l\'instant';
    const w=[];
    if(!NATIVE&&!window.isSecureContext)w.push('Le GPS ne fonctionne que si l\'appli est ouverte en <b>https</b>.');
    if(!NATIVE&&!('speechSynthesis' in window))w.push('Synthèse vocale indisponible dans ce navigateur : utilise Chrome (Android) ou Safari (iPhone).');
    $('#homeWarn').innerHTML=w.map(x=>`<div class="warnbox">${x}</div>`).join('')+(IOS&&!STANDALONE&&!NATIVE?`<div class="ioshint">📲 Sur iPhone : touche <span class="shr">Partager ⬆︎</span> en bas de Safari, puis « Sur l'écran d'accueil ». O'Guide s'ouvrira ensuite comme une appli, en plein écran et même sans réseau.</div>`:'');
    const act=store.get(K.active,null),fw=store.get(K.follow,null),orgs=store.get(K.orgs,[]),live=orgs.filter(orgOngoing).reverse();let h='';
    if(fw)h+=`<button class="primary big" id="hFollow">📍 Suivi en cours : ${esc(fw.sname||'')}</button>`;
    if(act)h+=`<button class="primary big" id="hResume">⏯ Reprendre l'épreuve : ${esc(act.course.name)}</button>`;
    if(live.length)h+=`<section class="now"><h2><span class="livedot" aria-hidden="true"></span>En cours</h2>${live.map(orgRow).join('')}</section>`;
    $('#homeExtra').innerHTML=h;
    const hr=$('#hResume');if(hr)hr.onclick=()=>Run.resumeActive();
    const hf=$('#hFollow');if(hf)hf.onclick=()=>Follow.resume();
    const nh=orgs.length-live.length+results.length;$('#hHistN').textContent=nh?nh+(nh>1?' éléments':' élément'):'vide';
    applyUi();
    $('#hVersion').textContent='Version '+VERSION+(NATIVE?' · application Android':' · fonctionne hors connexion une fois installée');
  }
};
/* ---------------- Historique : épreuves réalisées et courses organisées passées ---------------- */
const History={tab:'run',
  render(){
    const orgs=store.get(K.orgs,[]).filter(o=>!orgOngoing(o)).reverse(),rs=results.slice().reverse();
    $('#htOrgN').textContent=orgs.length;$('#htRunN').textContent=rs.length;
    $$('.htabs [data-ht]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.ht===this.tab)));
    $('#histList').innerHTML=this.tab==='org'
      ?(orgs.length?orgs.map(o=>`<li>${orgRow(o)}</li>`).join(''):'<li class="hint">Aucune course ou séance terminée. Les courses en cours restent sur l\'accueil.</li>')
      :(rs.length?rs.map(r=>`<li><button type="button" class="hitem" data-res="${r.id}"><span class="hi" aria-hidden="true">${r.raceCode?'📡':'🏃'}</span><span class="ht"><b>${esc(r.courseName)}</b><small>${new Date(r.date).toLocaleDateString('fr-FR')}${r.participant?' · '+esc(r.participant):''} · ${fmtTime(r.total)}${r.finished?'':' · arrêtée avant la fin'}</small></span><span class="go" aria-hidden="true">›</span></button></li>`).join(''):'<li class="hint">Aucune épreuve réalisée pour l\'instant.</li>');
  }
};
$('.htabs').addEventListener('click',e=>{const b=e.target.closest('[data-ht]');if(b){History.tab=b.dataset.ht;History.render()}});
$('#histList').addEventListener('click',e=>{
  const o=e.target.closest('[data-org]');if(o){Org.resume(o.dataset.org);PARENT.org='history';return}
  const b=e.target.closest('[data-res]');if(b){const r=results.find(x=>x.id===b.dataset.res);if(r){Results.show(r);PARENT.results='history'}}
});
$('#hHist').onclick=()=>show('history');
$('#hUi').onclick=()=>{const m=uiNow()==='acc'?'dv':'acc';settings.lastUi=m;if(settings.uiMode!=='ask')settings.uiMode=m;saveSettings();applyUi();
  toast(m==='acc'?'🤝 Interface compacte (avec un accompagnant), guidage vocal inchangé':'👂 Interface grands boutons');Voice.say(m==='acc'?'Interface compacte.':'Interface grands boutons.')};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();Home.deferred=e;$('#hInstall').hidden=false});
$('#hInstall').onclick=async()=>{if(!Home.deferred)return;Home.deferred.prompt();try{await Home.deferred.userChoice}catch(e){}Home.deferred=null;$('#hInstall').hidden=true};
$('#hCreate').onclick=()=>Create.begin();
$('#hJoin').onclick=()=>Join.open();
$('#hOrg').onclick=()=>{if(!courses.length){toast('Crée ou importe d\'abord un parcours.',true);return}Lib.open(true)};
$('#homeExtra').addEventListener('click',e=>{const b=e.target.closest('[data-org]');if(b){PARENT.org='home';Org.resume(b.dataset.org)}});
$('#hLib').onclick=()=>Lib.open();
$('#hImport').onclick=$('#libImport').onclick=()=>{$('#gpxInput').value='';$('#gpxInput').click()};
$('#hSettings').onclick=()=>Setup.open(null);
$('#hHelp').onclick=()=>show('help');
$('#gpxInput').onchange=async e=>{
  const files=[...e.target.files];let last=null,ok=0;
  for(const f of files){try{const c=parseGPX(await f.text(),f.name);courses.push(c);last=c;ok++;setTimeout(()=>autoPaths(c),500)}catch(err){toast(f.name+' : '+err.message,true)}}
  if(ok){saveCourses();toast(ok>1?ok+' parcours importés':'Parcours « '+last.name+' » importé');if(ok===1)Lib.openDetail(last.id);else Lib.open()}
};

/* ---------------- Création ---------------- */
const Create={map:null,lay:null,trackLine:null,meM:null,accC:null,draft:null,unsub:null,capturing:false,follow:true,firstFix:true,
  async begin(){
    const dr=store.get(K.draft,null);
    if(dr&&dr.points&&dr.points.length){
      const v=await modal({title:'Brouillon trouvé',body:`<p>Un parcours en cours de création (${dr.points.length} point(s)) a été sauvegardé.</p>`,buttons:[{label:'Reprendre le brouillon',value:'r',primary:true},{label:'Recommencer à zéro',value:'n',danger:true},{label:'Annuler',value:'c'}]});
      if(v==='c')return;if(v==='r'){this.draft=dr;this.open();return}
    }
    this.draft={id:uid(),name:'',created:new Date().toISOString(),points:[],track:[],stack:[]};this.open();
  },
  open(){
    if(!this.draft.stack)this.draft.stack=this.draft.points.map(p=>p.id);
    show('create');Snd.unlock();
    if(!this.map){
      this.map=makeMap($('#createMap'),'create');this.lay=L.layerGroup().addTo(this.map);
      this.trackLine=L.polyline([],{color:'#00B8D4',weight:4,opacity:.9}).addTo(this.map);
      this.map.on('dragstart',()=>{this.follow=false});
      this.map.on('click',e=>{if(settings.sim)GPS.simSet(e.latlng.lat,e.latlng.lng)});
      const C=L.Control.extend({onAdd:()=>{const b=L.DomUtil.create('button');b.textContent='⌖';b.title='Recentrer';b.setAttribute('aria-label','Recentrer sur ma position');b.style.cssText='min-height:50px;width:50px;padding:0;font-size:26px;background:#000';L.DomEvent.on(b,'click',ev=>{L.DomEvent.stop(ev);this.follow=true;if(GPS.last)this.map.setView([GPS.last.lat,GPS.last.lon],Math.max(this.map.getZoom(),17))});return b}});
      new C({position:'topright'}).addTo(this.map);
    }else setMapStyle(this.map);
    simPad($('#crSimPad'));
    this.follow=true;this.firstFix=true;this.meM=null;this.accC=null;
    setTimeout(()=>{this.map.invalidateSize();this.draw();
      if(this.draft.points.length)this.map.fitBounds(L.latLngBounds(this.draft.points.map(p=>[p.lat,p.lon])),{padding:[40,40],maxZoom:18})},80);
    GPS.start();this.unsub=GPS.on(f=>this.onFix(f));if(GPS.last)this.onFix(GPS.last);
    Wake.on();this.render();this.save();
  },
  close(){if(this.unsub)this.unsub();this.unsub=null;GPS.stop();Wake.off()},
  async askBack(){
    const v=await modal({title:'Quitter la création ?',body:'<p>Le brouillon est conservé : tu pourras le reprendre avec « Créer un parcours ».</p>',buttons:[{label:'Quitter',value:true,primary:true},{label:'Rester',value:false}]});
    if(v)show('home');
  },
  save(){store.set(K.draft,this.draft)},
  onFix(f){
    gpsBadge($('#crGps'),f);
    const ll=[f.lat,f.lon];
    if(!this.meM){this.meM=L.marker(ll,{icon:meIcon(null),interactive:false,zIndexOffset:2000}).addTo(this.map);this.accC=L.circle(ll,{radius:f.acc,color:'#00B8D4',weight:1,fillOpacity:.1,interactive:false}).addTo(this.map)}
    else{this.meM.setLatLng(ll);this.accC.setLatLng(ll).setRadius(f.acc)}
    if(this.follow){if(this.firstFix){this.map.setView(ll,18);this.firstFix=false}else this.map.panTo(ll,{animate:true})}
    if(settings.recordTrack&&f.acc<=25){
      const tr=this.draft.track,l=tr[tr.length-1];
      if(!l||dist({lat:l[0],lon:l[1]},f)>=4){tr.push([+f.lat.toFixed(6),+f.lon.toFixed(6),Date.now()]);this.trackLine.addLatLng(ll);if(tr.length%10===0)this.save()}
    }
    this.renderHint();
  },
  hasStart(){return this.draft.points.some(p=>p.type==='start')},
  hasFinish(){return this.draft.points.some(p=>p.type==='finish')},
  renumber(){let n=0;this.draft.points.forEach(p=>{if(p.type==='control'){n++;if(/^Balise( \d+)?$/.test(p.name))p.name='Balise '+n}})},
  insert(p){
    const pts=this.draft.points;
    if(p.type==='start'){pts.unshift(p)}
    else if(p.type==='finish'){const i=pts.findIndex(q=>q.type==='finish');if(i>=0){this.draft.stack=this.draft.stack.filter(id=>id!==pts[i].id);pts.splice(i,1)}pts.push(p)}
    else{const i=pts.findIndex(q=>q.type==='finish');if(i>=0)pts.splice(i,0,p);else pts.push(p)}
    this.draft.stack.push(p.id);this.renumber();this.save();this.draw();this.render();
  },
  async capture(type){
    if(this.capturing)return;
    if(!GPS.last||Date.now()-GPS.last.t>15000){toast('Pas encore de position GPS : patiente quelques secondes à découvert.',true);return}
    Snd.unlock();this.capturing=true;
    const btn=type==='finish'?$('#crFinishHere'):$('#crMain'),old=btn.innerHTML;
    const secs=settings.sim?0:settings.avgSeconds,samples=[GPS.last];
    if(secs>0){const un=GPS.on(f=>samples.push(f));$$('#create main button').forEach(b=>b.disabled=true);
      for(let s=secs;s>0;s--){btn.innerHTML='⏳ Ne bouge plus… '+s+' s';await sleep(1000)}
      un();$$('#create main button').forEach(b=>b.disabled=false)}
    let sw=0,la=0,lo=0,ac=0;samples.forEach(f=>{const w=1/Math.max(f.acc,1)**2;sw+=w;la+=f.lat*w;lo+=f.lon*w;ac+=f.acc});
    const acc=Math.round(ac/samples.length);
    const p={id:uid(),lat:+(la/sw).toFixed(7),lon:+(lo/sw).toFixed(7),type,name:type==='start'?'Départ':type==='finish'?'Arrivée':'Balise',desc:'',acc};
    btn.innerHTML=old;this.capturing=false;
    this.insert(p);
    Snd.chime();vib(150);
    const label=p.type==='control'?this.draft.points.find(q=>q.id===p.id).name:p.name;
    toast(label+' enregistré'+(p.type==='control'?'e':'')+' (±'+acc+' m)',acc>15);
    if(settings.voiceMode==='app')Voice.say(label+' enregistré'+(p.type==='control'?'e':'')+'.');
    if(acc>15)setTimeout(()=>toast('Précision moyenne (±'+acc+' m) : tu peux annuler et re-mesurer à découvert.',true),3300);
  },
  finishSameAsStart(){const s=this.draft.points.find(p=>p.type==='start');if(!s)return;
    this.insert({id:uid(),lat:s.lat,lon:s.lon,type:'finish',name:'Arrivée',desc:'',acc:s.acc});toast('Arrivée placée au départ');Snd.ok()},
  undo(){const id=this.draft.stack.pop();if(!id)return;const i=this.draft.points.findIndex(p=>p.id===id);if(i>=0){const n=this.draft.points[i].name;this.draft.points.splice(i,1);this.renumber();toast(n+' supprimé(e)')}this.save();this.draw();this.render()},
  async del(id){const p=this.draft.points.find(q=>q.id===id);if(!p)return;
    const v=await modal({title:'Supprimer '+p.name+' ?',buttons:[{label:'Supprimer',value:true,danger:true},{label:'Annuler',value:false}]});
    if(!v)return;this.draft.points=this.draft.points.filter(q=>q.id!==id);this.draft.stack=this.draft.stack.filter(x=>x!==id);this.renumber();this.save();this.draw();this.render()},
  draw(){this.lay.clearLayers();const pts=this.draft.points;
    if(pts.length>1)L.polyline(pts.map(p=>[p.lat,p.lon]),{color:'#FF2BD6',weight:3,dashArray:'6 8'}).addTo(this.lay);
    pts.forEach((p,i)=>L.marker([p.lat,p.lon],{icon:ctrlIcon(pts,i),interactive:false}).addTo(this.lay));
    this.trackLine.setLatLngs(this.draft.track.map(t=>[t[0],t[1]]))},
  renderHint(){const f=GPS.last;const h=$('#crHint');
    if(!f){h.textContent='Recherche du signal GPS… Place-toi à découvert.';return}
    const pts=this.draft.points;const last=pts.filter(p=>p.type!=='finish').slice(-1)[0];
    h.textContent=(last?'Distance depuis '+last.name+' : '+fmtDist(dist(last,f))+'. ':'')+(settings.avgSeconds&&!settings.sim?'Position moyennée sur '+settings.avgSeconds+' s : reste immobile pendant la mesure.':'')},
  render(){
    const pts=this.draft.points,nc=nControls(pts);
    $('#crMain').innerHTML=this.hasStart()?'📍 Enregistrer la BALISE '+(nc+1):'📍 Enregistrer le DÉPART';
    $('#crFinishHere').disabled=$('#crFinishStart').disabled=$('#crDone').disabled=!(this.hasStart()&&nc>0);
    $('#crUndo').disabled=!this.draft.stack.length;
    $('#crCount').textContent=pts.length+' point'+(pts.length>1?'s':'')+' · '+fmtDist(courseLength(pts));
    $('#crList').innerHTML=pts.map((p,i)=>{
      const leg=i>0?`<div class="pl-leg">depuis ${esc(pts[i-1].name)} : ${fmtDist(dist(pts[i-1],p))} · ${Math.round(bearing(pts[i-1],p))}° ${cardS(bearing(pts[i-1],p))}</div>`:'';
      return`<li><div class="pl-head"><span class="pl-ico ${p.type}">${shortLabel(pts,i)}</span><b>${esc(p.name)}</b><span class="muted">±${p.acc!=null?p.acc:'?'} m</span><button type="button" class="mini danger" data-del="${p.id}" aria-label="Supprimer ${esc(p.name)}">✕</button></div>${leg}<input type="text" class="pl-desc" data-id="${p.id}" value="${esc(p.desc)}" placeholder="Indice lu à l'approche (facultatif)" aria-label="Indice pour ${esc(p.name)}"></li>`}).reverse().join('');
    this.renderHint();
  },
  async done(){
    const pts=this.draft.points;
    if(!this.hasFinish()){
      const v=await modal({title:'Pas encore d\'arrivée',body:'<p>Où se trouve l\'arrivée ?</p>',buttons:[{label:'🏁 Au départ (boucle)',value:'s',primary:true},{label:'🏁 Ici (position actuelle)',value:'h'},{label:'Sans arrivée',value:'n'},{label:'Annuler',value:'c'}]});
      if(v==='c')return;if(v==='s')this.finishSameAsStart();if(v==='h'){await this.capture('finish')}
    }
    const def='Parcours du '+new Date().toLocaleDateString('fr-FR')+' '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    const r=await modal({title:'Nom du parcours',input:{value:this.draft.name||def},buttons:[{label:'💾 Enregistrer',value:true,primary:true},{label:'Annuler',value:false}]});
    if(!r.value)return;
    const c={id:this.draft.id,name:r.text||def,created:this.draft.created,points:pts.map(p=>({id:p.id,lat:p.lat,lon:p.lon,type:p.type,name:p.name,desc:p.desc,acc:p.acc})),track:this.draft.track};
    const i=courses.findIndex(x=>x.id===c.id);if(i>=0)courses[i]=c;else courses.push(c);
    saveCourses();store.del(K.draft);this.draft=null;
    Snd.fanfare();toast('Parcours enregistré ✔');
    Lib.openDetail(c.id);autoPaths(c);
  }
};
$('#crMain').onclick=()=>Create.capture(Create.hasStart()?'control':'start');
$('#crFinishHere').onclick=()=>Create.capture('finish');
$('#crFinishStart').onclick=()=>Create.finishSameAsStart();
$('#crUndo').onclick=()=>Create.undo();
$('#crDone').onclick=()=>Create.done();
$('#crBack').onclick=()=>Create.askBack();
$('#crList').addEventListener('input',e=>{const el=e.target.closest('.pl-desc');if(!el)return;const p=Create.draft.points.find(q=>q.id===el.dataset.id);if(p){p.desc=el.value;Create.save()}});
$('#crList').addEventListener('click',e=>{const b=e.target.closest('[data-del]');if(b)Create.del(b.dataset.del)});

/* ---------------- Bibliothèque & détail ---------------- */
const Lib={map:null,lay:null,cur:null,editing:false,
  open(forOrg){
    show('library');this.forOrg=!!forOrg;$('#libTitle').textContent=forOrg?'Organiser : choisis un parcours':'Mes parcours';
    const L0=courses.slice().reverse();
    $('#libList').innerHTML=L0.length?L0.map(c=>`<li><button type="button" class="card-btn" data-open="${c.id}"><b>${esc(c.name)}</b><span>${nControls(c.points)} balises · ${fmtDist(courseLength(c.points))} · ${new Date(c.created).toLocaleDateString('fr-FR')}${c.imported?' · importé':''}</span></button><button type="button" class="play" ${forOrg?`data-org="${c.id}" aria-label="Organiser une course avec ${esc(c.name)}">📡`:`data-run="${c.id}" aria-label="Faire le parcours ${esc(c.name)}">▶`}</button></li>`).join('')
      :'<li class="hint">Aucun parcours pour l\'instant. Crée-en un ou importe un fichier GPX.</li>';
  },
  openDetail(id){
    const c=courses.find(x=>x.id===id);if(!c){this.open();return}
    this.cur=c;this.editing=false;show('detail');
    $('#dtTitle').textContent=c.name;
    if(!this.map){this.map=makeMap($('#detailMap'),'detail');this.pathLay=L.layerGroup().addTo(this.map);this.lay=L.layerGroup().addTo(this.map)}else setMapStyle(this.map);
    setTimeout(()=>{this.map.invalidateSize();this.draw(true)},80);
    this.renderInfo();
  },
  leaveDetail(){this.editing=false},
  draw(fit){
    const c=this.cur;this.lay.clearLayers();const pts=c.points;
    drawPaths(this.pathLay,Paths.get(c.id),mapStyleOf(this.map));
    if(c.track&&c.track.length>1)L.polyline(c.track.map(t=>[t[0],t[1]]),{color:'#00B8D4',weight:3,opacity:.8}).addTo(this.lay);
    if(pts.length>1)L.polyline(pts.map(p=>[p.lat,p.lon]),{color:'#FF2BD6',weight:3,dashArray:'6 8'}).addTo(this.lay);
    pts.forEach((p,i)=>{const m=L.marker([p.lat,p.lon],{icon:ctrlIcon(pts,i,{size:this.editing?52:40}),draggable:this.editing,keyboard:false}).addTo(this.lay);
      m.on('dragend',()=>{const ll=m.getLatLng();
        if(p.type==='start'){const f=pts.find(q=>q.type==='finish');if(f&&f.lat===p.lat&&f.lon===p.lon){f.lat=+ll.lat.toFixed(7);f.lon=+ll.lng.toFixed(7)}}
        p.lat=+ll.lat.toFixed(7);p.lon=+ll.lng.toFixed(7);saveCourses();toast(p.name+' déplacée');this.draw(false);this.renderInfo()})});
    if(fit&&pts.length)this.map.fitBounds(L.latLngBounds(pts.map(p=>[p.lat,p.lon])),{padding:[40,40],maxZoom:18});
  },
  renderInfo(){
    const c=this.cur,pts=c.points;
    $('#dtSummary').innerHTML=`<p><b>${nControls(pts)} balises</b> · ${fmtDist(courseLength(pts))} à vol d'oiseau</p><p class="hint">Créé le ${new Date(c.created).toLocaleString('fr-FR')}${c.imported?' (importé)':''}${c.track&&c.track.length>1?' · trace de '+c.track.length+' points':''}</p>`;
    $('#dtList').innerHTML=pts.map((p,i)=>{const leg=i>0?`<div class="pl-leg">depuis ${esc(pts[i-1].name)} : ${fmtDist(dist(pts[i-1],p))} · azimut ${Math.round(bearing(pts[i-1],p))}° ${cardS(bearing(pts[i-1],p))}</div>`:'';
      return`<li><div class="pl-head"><span class="pl-ico ${p.type}">${shortLabel(pts,i)}</span><b>${esc(p.name)}</b></div>${leg}<input type="text" class="pl-desc" data-id="${p.id}" value="${esc(p.desc||'')}" placeholder="Indice lu à l'approche (facultatif)" aria-label="Indice pour ${esc(p.name)}"></li>`}).join('');
    const rs=results.filter(r=>r.courseId===c.id).slice().reverse();
    $('#dtResults').innerHTML=rs.length?`<section class="card"><h2>Épreuves réalisées</h2>${rs.map(r=>`<button type="button" data-res="${r.id}" style="justify-content:space-between"><span>${esc(r.participant||'Participant')} · ${new Date(r.date).toLocaleDateString('fr-FR')}</span><span>${r.finished?'':'⚠ '}${fmtTime(r.total)}</span></button>`).join('')}</section>`:'';
    const pd=Paths.get(c.id);
    $('#dtPaths').innerHTML=pd?`🗺 <b>Chemins enregistrés</b> : ${pd.ways.length} tronçons (${new Date(pd.fetched).toLocaleDateString('fr-FR')}), utilisables hors connexion pour la carte et l'itinéraire.`
      :`🗺 <b>Chemins pas encore téléchargés.</b> Ils servent à la carte des chemins et à l'itinéraire du profil malvoyant (réseau nécessaire une fois).`;
    $('#dtPathsBtn').textContent=pd?'🔄 Mettre à jour les chemins':'🗺 Télécharger les chemins';
    $('#dtEdit').textContent=this.editing?'✔ Fin des corrections':'✋ Corriger les positions';
    $('#dtEditHint').hidden=!this.editing;
  }
};
$('#libList').addEventListener('click',e=>{const g=e.target.closest('[data-org]');if(g){const c=courses.find(x=>x.id===g.dataset.org);if(c){Lib.cur=c;OrgSetup.open(c)}return}const o=e.target.closest('[data-open]');if(o){if(Lib.forOrg){const c=courses.find(x=>x.id===o.dataset.open);if(c){Lib.cur=c;OrgSetup.open(c)}return}Lib.openDetail(o.dataset.open);return}const r=e.target.closest('[data-run]');if(r)Setup.open(r.dataset.run)});
$('#dtRun').onclick=()=>Setup.open(Lib.cur.id);
$('#dtOrg').onclick=()=>OrgSetup.open(Lib.cur);
$('#dtPrint').onclick=()=>PrintMap.open(Lib.cur);
$('#dtShare').onclick=()=>shareFile(slug(Lib.cur.name)+'.gpx',courseToGPX(Lib.cur));
$('#dtDownload').onclick=()=>saveFile(slug(Lib.cur.name)+'.gpx',courseToGPX(Lib.cur));
$('#dtPathsBtn').onclick=async()=>{const c=Lib.cur,b=$('#dtPathsBtn');b.disabled=true;b.textContent='⏳ Téléchargement…';
  try{const d=await Paths.fetch(c);toast(`Chemins enregistrés : ${d.ways.length} tronçons`)}catch(e){toast('Échec : '+e.message+'. Vérifie la connexion.',true)}
  b.disabled=false;if(Lib.cur===c){Lib.draw(false);Lib.renderInfo()}};
function autoPaths(c){if(Paths.get(c.id))return;Paths.ensure(c,{quiet:true}).then(d=>{if(d&&current==='detail'&&Lib.cur&&Lib.cur.id===c.id){Lib.draw(false);Lib.renderInfo()}if(d&&current==='setup'&&Setup.course===c)Setup.renderCourse()})}
$('#dtEdit').onclick=()=>{Lib.editing=!Lib.editing;Lib.draw(false);Lib.renderInfo()};
$('#dtRename').onclick=async()=>{const r=await modal({title:'Renommer le parcours',input:{value:Lib.cur.name},buttons:[{label:'OK',value:true,primary:true},{label:'Annuler',value:false}]});if(r.value&&r.text){Lib.cur.name=r.text;saveCourses();$('#dtTitle').textContent=r.text}};
$('#dtDelete').onclick=async()=>{const v=await modal({title:'Supprimer « '+Lib.cur.name+' » ?',body:'<p>Cette action est définitive. Exporte le GPX avant si besoin.</p>',buttons:[{label:'Supprimer',value:true,danger:true},{label:'Annuler',value:false}]});if(v){Paths.del(Lib.cur.id);courses=courses.filter(c=>c.id!==Lib.cur.id);saveCourses();toast('Parcours supprimé');Lib.open()}};
$('#dtList').addEventListener('input',e=>{const el=e.target.closest('.pl-desc');if(!el)return;const p=Lib.cur.points.find(q=>q.id===el.dataset.id);if(p){p.desc=el.value;saveCourses()}});
$('#dtResults').addEventListener('click',e=>{const b=e.target.closest('[data-res]');if(b){const r=results.find(x=>x.id===b.dataset.res);if(r)Results.show(r)}});

/* ---------------- Préparation / réglages ---------------- */
const Setup={course:null,
  open(id){
    this.course=id?courses.find(c=>c.id===id):null;
    $('#suTitle').textContent=this.course?'Préparer l\'épreuve':'Réglages';
    $('#startRun').hidden=$('#suPartCard').hidden=$('#suCourse').hidden=!this.course;
    if(this.course){this.renderCourse();autoPaths(this.course)}
    bindSettings();this.compassUI();show('setup');
  },
  renderCourse(){const c=this.course;if(!c)return;const pd=Paths.get(c.id);
    $('#suCourse').innerHTML=`<p><b>${esc(c.name)}</b></p><p class="hint">${nControls(c.points)} balises · ${fmtDist(courseLength(c.points))}${c.points[0].type==='start'?' · le chrono démarre à la validation du départ':' · pas de départ défini : le chrono démarre tout de suite'}</p><p class="hint">${pd?'🗺 Chemins enregistrés : carte des chemins et itinéraire disponibles hors connexion.':'🗺 Chemins pas encore téléchargés (réseau nécessaire) : nouvel essai au démarrage.'}</p>`},
  back(){if(this.course)Lib.openDetail(this.course.id);else show('home')},
  compassUI(){const v=Compass.get(),ask=Compass.needsPerm&&!Compass.active;$('#compassBtn').hidden=!ask;
    $('#compassState').textContent=v!=null?`✔ Boussole active : le haut du téléphone pointe vers le ${card(v)} (${Math.round(v)}°).`:ask?'Sur iPhone, touche « Autoriser la boussole ».':'Aucune boussole détectée pour l\'instant (normal sur ordinateur) : la direction utilisera le sens de marche.'}
};
$('#suBack').onclick=()=>Setup.back();
function bindSettings(){
  $$('#settingsBox [data-s]').forEach(el=>{
    const k=el.dataset.s;
    if(el.classList.contains('seg')){
      const btns=[...el.querySelectorAll('button')];
      const upd=()=>btns.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===settings[k])));upd();
      btns.forEach(b=>b.onclick=()=>{settings[k]=b.dataset.v;saveSettings();upd();onSetting(k)});
    }else if(el.type==='checkbox'){el.checked=!!settings[k];el.onchange=()=>{settings[k]=el.checked;saveSettings();onSetting(k)}}
    else{el.value=String(settings[k]);const h=()=>{settings[k]=('num' in el.dataset)?parseFloat(el.value):el.value;saveSettings();onSetting(k)};el.onchange=h;if(el.type==='range')el.oninput=h}
  });
}
function onSetting(k){
  const live=current==='run'&&!Run.ended;
  if(k==='uiMode'){if(settings.uiMode!=='ask')settings.lastUi=settings.uiMode;saveSettings();applyUi()}
  if(k==='layer'||k==='contrast'||k==='mapStyle'){Run.pathsDrawn=false;allMaps.forEach(setMapStyle);if(Lib.map&&Lib.cur)Lib.draw(false);if(live){Run.ensurePaths();Run.redrawMap()}}
  if(k==='sim'){applySimUI();GPS.stop();toast(settings.sim?'Mode simulation activé':'Mode simulation désactivé : retour au vrai GPS');if(live||current==='create')GPS.start();if(live)simPad($('#runSimPad'),Run.simExtra())}
  if(!live)return;
  if(k==='profile')Run.applyProfile();
  if(k==='showRoute'){Run.route=null;Run.lastRouteT=0;Run.ensurePaths();Run.updateMap();if(!settings.showRoute)$('#runRoute').textContent=''}
  if(k==='radius'||k==='showDone')Run.redrawMap();
  if(k==='showMe'){Run.redrawMap();Run.fit(true)}
  if(k==='voiceMode'&&settings.voiceMode!=='app')Voice.stop();
  if(k==='dirFormat'||k==='headingRef')Run.renderDir();
}
$('#testVoice').onclick=()=>{Snd.unlock();Voice.unlock();const m=settings.voiceMode;if(m==='off'){toast('Voix désactivée');return}Voice.say('Balise 3 : 120 mètres, azimut 45 degrés, nord-est. Vous vous rapprochez.');if(m==='sr')toast('Le texte est envoyé au lecteur d\'écran')};
$('#testBeep').onclick=async()=>{Snd.unlock();for(let i=0;i<14;i++){const k=1-i/13;Snd.tone(1500-k*900,0.08,{vol:0.5});await sleep(180+k*1100)}Snd.chime();vib([200,100,200])};
$('#compassBtn').onclick=async()=>{const ok=await Compass.enable();if(!ok)toast('Boussole refusée ou indisponible sur cet appareil',true);setTimeout(()=>Setup.compassUI(),800)};
Compass.onChange=()=>{if(current==='setup'||RunOpts.open)Setup.compassUI();if(current==='run')Run.renderDir()};
$('#startRun').onclick=async()=>{
  Snd.unlock();Voice.unlock();if(!await Run.checkActive())return;Compass.enable();
  if(settings.voiceMode==='app'&&!NATIVE&&!('speechSynthesis' in window))toast('Synthèse vocale indisponible ici',true);
  Run.open(Setup.course,$('#partName').value.trim());
};

/* ---------------- Épreuve ---------------- */
const Run={map:null,lay:null,
  open(course,participant,ctx={}){
    const rs=ctx.resume||null,link=ctx.race||null,rinfo=link&&link.race?{code:link.code,opts:link.race.opts||{}}:rs&&rs.race?rs.race:null;
    if(this.link&&this.link!==link){try{this.link.close()}catch(e){}}
    Object.assign(this,{c:course,pts:course.points,idx:rs?rs.idx:0,participant,splits:rs?rs.splits:[],track:rs?rs.track||[]:[],t0:rs?rs.t0:null,pausedAt:null,pausedTotal:rs?rs.pausedTotal||0:0,lastAnn:0,lastAnnDist:null,inZone:false,insideSince:null,
      link,race:rinfo?{code:rinfo.code,opts:Object.assign({startType:'individual',radius:10},rinfo.opts)}:null,pid:rs&&rs.pid||uid(),finishAt:null,rstatus:null,lastPub:0,lastTrk:0,lastSave:0,waiting:false,
      lastFixT:Date.now(),lostSaid:false,ended:false,d:null,b:null,follow:true,lastFit:0,id:rs?rs.id:uid(),date:rs?rs.date:new Date().toISOString(),meM:null,accC:null,line:null,
      route:null,lastRouteT:0,pathsDrawn:false,routeLine:null,routeCase:null,dist:rs&&rs.dist||0,dlast:null,sm:new SpeedMeter(),endBy:null});
    {const lt=rs&&this.t0&&this.track[this.track.length-1];if(lt)this.dlast={lat:lt[0],lon:lt[1],t:lt[2]}}
    $('#runRoute').textContent='';
    if(this.lay)this.lay.clearLayers();
    if(this.link)this.link.onRace=r=>this.onRace(r);
    if(this.link)PMsg.start({link:this.link,pid:this.pid,name:participant||'Coureur',saved:rs&&rs.msg,onChange:()=>{this.save();this.publish(true)}});else PMsg.stop();
    const lr=link&&link.race;
    if(this.race&&this.race.opts.startType==='mass'&&!this.t0){if(lr&&lr.status==='started')this.t0=lr.startAt||Date.now();else this.waiting=true}
    if(!rs&&!this.waiting&&!this.t0&&this.pts[0].type!=='start')this.t0=Date.now();
    if(!rs&&lr&&lr.status==='started'&&this.race.opts.startType==='mass'&&this.pts[0].type==='start'){this.splits.push({id:this.pts[0].id,name:this.pts[0].name,type:'start',elapsed:0,leg:0,mode:'auto',lat:this.pts[0].lat,lon:this.pts[0].lon,time:new Date(this.t0).toISOString()});this.idx=1}
    $('#runPause').hidden=!!this.race;
    $('#runPause').classList.remove('paused');$('#runPause').innerHTML='⏸ Pause';$('#runMsg').textContent='';
    $('#runValidate').hidden=false;
    show('run');
    this.applyProfile();
    simPad($('#runSimPad'),this.simExtra());
    GPS.start();this.unsub=GPS.on(f=>this.onFix(f));
    Wake.on();
    clearInterval(this.tickI);this.tickI=setInterval(()=>this.tick(),1000);
    this.beepLoop();
    const nc=nControls(this.pts);
    const intro=rs?'Épreuve reprise. ':`${this.race?'Course':'Parcours'} ${this.c.name}. ${nc} balise${nc>1?'s':''}. `+(this.waiting?'En attente du départ donné par l\'organisateur. ':this.t0?'Chrono lancé. ':'Rendez-vous d\'abord au départ. ');
    if(GPS.last)this.compute(GPS.last);
    this.render();this.save();this.publish(true);
    setTimeout(()=>this.announce(intro+this.guidance()),300);
    if(lr)this.onRace(lr);
  },
  /* course organisée : rayon fixé par l'organisateur ; position sur la carte malvoyant selon ses règles */
  rad(){return this.race&&this.race.opts.radius?this.race.opts.radius:settings.radius},
  showMe(){return settings.showMe&&(!this.race||this.waiting||this.race.opts.showMe!==false)},
  onRace(r){
    if(this.ended||!r)return;
    if(this.waiting&&r.status==='started'){
      this.waiting=false;this.t0=r.startAt||Date.now();Snd.fanfare();vib([300,100,300]);toast('🏁 Départ donné par l\'organisateur');
      const t=this.target();if(t&&t.type==='start')this.validate('auto');else{this.compute(GPS.last);this.render();this.lastAnn=Date.now();this.announce('Départ ! Chrono lancé. '+this.guidance())}
      this.publish(true);this.save();this.redrawMap();
    }
    if((r.status==='closed'||r.status==='deleted')&&!this.ended){toast('L\'organisateur a clos la course.',true);this.finish(false,'closed')}
  },
  status(){return this.ended?this.rstatus:this.t0?'running':'waiting'},
  publish(force){
    if(!this.link)return;const now=Date.now();if(!force&&now-this.lastPub<5000)return;this.lastPub=now;const f=GPS.last;
    this.link.publishState({pid:this.pid,name:this.participant||'Coureur',status:this.status(),startAt:this.t0,finishAt:this.finishAt,
      visited:this.splits.filter(s=>s.id&&s.mode!=='skip').map(s=>({id:s.id,el:s.elapsed,leg:s.leg,m:s.mode==='manual'?'manual':'auto',d:s.d})),score:0,pen:0,net:0,
      dist:this.t0?Math.round(this.dist):0,spd:this.status()==='running'&&!this.pausedAt?this.sm.value():undefined,sos:PMsg.on&&PMsg.sosActive()||undefined,endBy:this.endBy||undefined,
      pos:f?{lat:+f.lat.toFixed(6),lon:+f.lon.toFixed(6),acc:f.sim?3:Math.round(f.acc),t:f.t,sim:f.sim?1:undefined}:null,bat:Battery.level,app:NATIVE?'android':'web',og:settings.profile,upd:now});
    if(force||now-this.lastTrk>60000){this.lastTrk=now;const e=encTrack(this.track.slice(-3000));if(e)this.link.publishTrack(this.pid,this.participant||'Coureur',e)}
  },
  saveSoon(){if(Date.now()-this.lastSave>20000)this.save()},
  save(){if(this.ended)return;this.lastSave=Date.now();
    store.set(K.active,{id:this.id,course:this.c,participant:this.participant,date:this.date,idx:this.idx,splits:this.splits,t0:this.t0,
      pausedTotal:this.pausedTotal+(this.pausedAt?Date.now()-this.pausedAt:0),track:this.track.slice(-1500),pid:this.pid,race:this.race,dist:this.dist,msg:PMsg.on?PMsg.snapshot():undefined})},
  async checkActive(){
    const a=store.get(K.active,null);if(!a||!a.course)return true;
    const v=await modal({title:'Une épreuve est déjà en cours',body:`<p>${esc(a.course.name)}</p>`,buttons:[{label:'Reprendre cette épreuve',value:'r',primary:true},{label:'L\'abandonner',value:'n',danger:true},{label:'Annuler',value:'c'}]});
    if(v==='r'){this.resumeActive();return false}
    if(v==='n'){store.del(K.active);return true}
    return false;
  },
  async resumeActive(){
    const a=store.get(K.active,null);if(!a||!a.course){store.del(K.active);Home.render();return}
    Snd.unlock();Voice.unlock();Compass.enable();
    let link=null;if(a.race){try{link=await RaceLink.connect(a.race.code,{silent:true})}catch(e){}
      if(link&&!link.race)toast('Relais injoignable pour l\'instant : l\'épreuve reprend, les données partiront dès le retour du réseau.',true)}
    this.open(a.course,a.participant,{race:link,resume:a});
  },
  renderNet(){const e=$('#runNet');if(!e)return;e.hidden=!this.link;if(this.link){e.textContent=this.link.connected?'📡':'📡✖';e.title=this.link.connected?'Connecté au relais':'Hors ligne : envoi au retour du réseau'}},
  target(){return this.pts[this.idx]},
  simExtra(){return[['⇢ +10 m balise',()=>{const t=this.target(),f=GPS.last;if(t&&f)GPS.simMove(bearing(f,t),Math.min(10,dist(f,t)))}]]},
  applyProfile(){
    const scr=$('#run'),low=settings.profile==='low';scr.classList.toggle('blind',!low);scr.classList.toggle('low',low);
    $('#runTap').firstChild.textContent=low?'🔊 Répéter l\'annonce':'🔊 Toucher l\'écran pour répéter';
    if(low){this.initMap();this.ensurePaths()}else $('#runRoute').textContent='';
  },
  ensurePaths(){
    const course=this.c;if(!course||settings.profile!=='low'||Paths.get(course.id))return;
    if(!(settings.showRoute||settings.mapStyle!=='map'))return;
    if(this._fetching===course.id)return;this._fetching=course.id;
    Paths.ensure(course).then(d=>{this._fetching=null;if(d&&current==='run'&&this.c===course){this.pathsDrawn=false;this.lastRouteT=0;this.redrawMap()}});
  },
  elapsed(){if(!this.t0)return 0;const now=this.pausedAt||Date.now();return now-this.t0-this.pausedTotal},
  compute(f){const t=this.target();if(!t||!f)return;this.d=dist(f,t);this.b=bearing(f,t)},
  onFix(f){
    this.lastFixT=Date.now();
    if(this.lostSaid){this.lostSaid=false;this.announce('Signal GPS retrouvé. '+this.guidance())}
    if(!this.ended&&f.acc<=30){const tr=this.track,l=tr[tr.length-1];if(!l||dist({lat:l[0],lon:l[1]},f)>=3)tr.push([+f.lat.toFixed(6),+f.lon.toFixed(6),Date.now()])}
    if(!this.ended&&this.t0&&!this.pausedAt&&!this.waiting&&f.acc<=30){const p={lat:f.lat,lon:f.lon,t:Date.now()},l=this.dlast;
      if(!l)this.dlast=p;else{const d=dist(l,p);if(d>=5){if(d/Math.max(1,(p.t-l.t)/1000)<20)this.dist+=d;this.dlast=p}}this.sm.add(f)}
    if(this.ended)return;
    this.compute(f);this.render();this.updateMap();
    if(this.pausedAt)return;
    if(this.waiting){this.publish();this.saveSoon();return}
    const t=this.target(),d=this.d;
    if(!this.inZone&&d<=settings.approachDist&&d>this.rad()){
      this.inZone=true;Snd.ok();vib(120);
      this.announce(`Zone d'approche. ${t.name} à ${spokenDist(d)}, ${this.spokenDir(this.b)}.`+(t.desc?` Indice : ${t.desc}.`:''));this.lastAnnDist=d;
    }else if(this.inZone&&d>settings.approachDist+10)this.inZone=false;
    const accOk=f.acc<=Math.max(30,this.rad()*3);
    if(d<=this.rad()&&accOk){if(!this.insideSince)this.insideSince=Date.now();if(f.sim||Date.now()-this.insideSince>=1500)this.validate('auto')}else this.insideSince=null;
    if(!this.ended){this.beepCheck();this.tick();this.publish();this.saveSoon()}
  },
  spokenDir(b){
    if(settings.dirFormat==='clock'){const hd=currentHeading();if(hd){const c=clockOf((b-hd.h+360)%360);return`à ${c} heure${c>1?'s':''}`+(c===12?', droit devant':c===6?', derrière vous':'')}}
    if(settings.dirFormat==='clock')return`direction ${card(b)}, azimut ${(Math.round(b/5)*5)%360} degrés`;
    return`azimut ${(Math.round(b/5)*5)%360} degrés, ${card(b)}`;
  },
  guidance(){
    const t=this.target(),f=GPS.last;if(!t)return'';
    if(!f)return`${t.name}. Recherche du signal GPS, restez à découvert.`;
    const d=dist(f,t),b=bearing(f,t);let s=`${t.name} : ${spokenDist(d)}, ${this.spokenDir(b)}.`;
    if(this.lastAnnDist!=null){const dd=d-this.lastAnnDist;if(dd<=-6)s+=' Vous vous rapprochez.';else if(dd>=6)s+=' Attention, vous vous éloignez.'}
    if(this.inZone&&t.desc)s+=` Indice : ${t.desc}.`;
    if(f.acc>30)s+=` GPS imprécis, plus ou moins ${Math.round(f.acc)} mètres.`;
    if(Date.now()-f.t>30000)s+=' Position non actualisée.';
    this.lastAnnDist=d;return s;
  },
  announce(text){Voice.say(text);this.lastAnn=Date.now();$('#runMsg').textContent=text},
  repeat(){Snd.unlock();if(this.ended)return;if(this.pausedAt){this.announce('Épreuve en pause. Touchez Reprendre.');return}this.announce(this.guidance())},
  tick(){
    $('#runChrono').textContent=fmtTime(this.elapsed());
    if(this.ended||this.pausedAt)return;
    const now=Date.now();this.publish();
    if(this.waiting){if(now-this.lastAnn>=settings.interval*1000)this.announce('En attente du départ donné par l\'organisateur. '+this.guidance());return}
    if(this.insideSince&&now-this.insideSince>=1500){const f=GPS.last,t=this.target();if(f&&t&&dist(f,t)<=this.rad()){this.validate('auto');return}this.insideSince=null}
    const age=now-this.lastFixT,err=GPS.lastErrT>this.lastFixT;
    if(((err&&age>10000)||age>60000)&&!this.lostSaid){this.lostSaid=true;Snd.warn();this.announce(err?'Signal GPS perdu. Avancez à découvert ou attendez.':'Position GPS non actualisée depuis une minute.');return}
    const iv=(this.inZone?Math.min(settings.interval,settings.zoneInterval):settings.interval)*1000;
    if(now-this.lastAnn>=iv)this.announce(this.guidance());
  },
  beepLoop(){clearInterval(this.beepI);this.nextBeep=0;this.beepI=setInterval(()=>this.beepCheck(),100)},
  beepCheck(){
    if(this.ended||this.pausedAt||this.waiting||!settings.beep||!this.inZone||this.d==null||current!=='run')return;
    const now=Date.now();if(now<this.nextBeep||Voice.busy())return;
    const r=this.rad(),A=Math.max(settings.approachDist,r+1),k=Math.max(0,Math.min(1,(this.d-r)/(A-r)));
    this.nextBeep=now+170+k*1300;let freq=1500-k*900,pan=0;const hd=currentHeading();
    if(hd){const rel=((this.b-hd.h)+360)%360;if(settings.stereo)pan=Math.sin(rel*RAD);if(rel>100&&rel<260)freq*=0.6}
    Snd.tone(freq,0.08,{pan,vol:0.55});
  },
  validate(mode){
    if(this.ended)return;
    if(this.waiting){this.announce('En attente du départ donné par l\'organisateur.');return}
    const t=this.target(),now=Date.now();
    if(t.type==='start'&&!this.t0)this.t0=now;
    const el=this.elapsed(),prev=this.splits.length?this.splits[this.splits.length-1].elapsed:0,f=GPS.last;
    if(t.type==='start'){this.dist=0;this.dlast=null}
    this.splits.push({id:t.id,name:t.name,type:t.type,elapsed:el,leg:el-prev,mode,lat:f?+f.lat.toFixed(6):t.lat,lon:f?+f.lon.toFixed(6):t.lon,time:new Date(now).toISOString(),d:Math.round(this.dist)});
    this.idx++;this.inZone=false;this.insideSince=null;this.route=null;this.lastRouteT=0;this.lastAnnDist=null;this.d=null;
    if(this.idx>=this.pts.length){this.finish(true);return}
    this.publish(true);this.save();
    vib(mode==='skip'?[400]:[200,100,200]);
    if(mode==='skip')Snd.warn();else Snd.chime();
    let msg=t.type==='start'?'Départ validé, chrono lancé. ':mode==='skip'?`${t.name} passée. `:`${t.name} validée ! Temps : ${spokenTime(el)}. `;
    const nt=this.target();if(nt.type==='finish')msg+='Direction l\'arrivée. ';
    this.compute(GPS.last);this.render();this.redrawMap();this.fit(true);
    this.lastAnn=Date.now();
    setTimeout(()=>{if(!this.ended)this.announce(msg+this.guidance())},800);
  },
  finish(done,why){
    this.ended=true;this.waiting=false;Lock.disable(true);RunOpts.hide();clearInterval(this.tickI);clearInterval(this.beepI);
    if(this.pausedAt){this.pausedTotal+=Date.now()-this.pausedAt;this.pausedAt=null}
    const total=this.elapsed();
    this.rstatus=done?'finished':(why||'abandoned');this.finishAt=this.t0?this.t0+total+this.pausedTotal:null;this.endBy=done||why==='closed'?null:'runner';
    store.del(K.active);this.publish(true);PMsg.stop();
    const link=this.link;if(link)setTimeout(()=>{try{link.close()}catch(e){}if(this.link===link)this.link=null},4000);
    if(done){Snd.fanfare();vib([300,100,300,100,600]);this.announce(`Arrivée ! Parcours terminé en ${spokenTime(total)}. Bravo !`)}
    else this.announce(why==='closed'?'Course close par l\'organisateur. Vos temps sont enregistrés.':'Épreuve arrêtée.');
    const r={id:this.id,courseId:this.c.id,courseName:this.c.name,participant:this.participant,date:this.date,total,finished:done,
      nPoints:this.pts.length,splits:this.splits,track:this.track.slice(-4000),radius:this.rad(),raceCode:this.race?this.race.code:undefined,dist:Math.round(this.dist)};
    results.push(r);saveResults();
    if(this.unsub)this.unsub();this.unsub=null;GPS.stop();Wake.off();
    setTimeout(()=>Results.show(r),done?2500:400);
  },
  async askQuit(){
    const v=await modal({title:this.race?'Abandonner la course ?':'Arrêter l\'épreuve ?',body:'<p>Les temps déjà réalisés seront conservés.</p>',buttons:[{label:'Arrêter et voir les résultats',value:true,danger:true},{label:'Continuer l\'épreuve',value:false,primary:true}]});
    if(v&&!this.ended)this.finish(false);
  },
  togglePause(){
    if(this.ended)return;const b=$('#runPause');
    if(this.pausedAt){this.pausedTotal+=Date.now()-this.pausedAt;this.pausedAt=null;b.classList.remove('paused');b.innerHTML='⏸ Pause';this.announce('Reprise. '+this.guidance())}
    else{this.pausedAt=Date.now();b.classList.add('paused');b.innerHTML='▶ Reprendre';Voice.stop();this.announce('Pause. Le chrono est arrêté.')}
  },
  onResumeVisible(){if(!this.ended&&!this.pausedAt&&!this.waiting)setTimeout(()=>this.announce('Guidage repris. '+this.guidance()),500)},
  render(){
    const t=this.target();if(!t)return;
    const nc=nControls(this.pts);let lbl=this.waiting?'⏳ Attente du départ':t.name;
    if(t.type==='control'&&!this.waiting)lbl+=` · ${shortLabel(this.pts,this.idx)}/${nc}`;
    this.renderNet();
    $('#runTarget').textContent=lbl;
    $('#runDist').textContent=this.d!=null?fmtDist(this.d):'—';
    $('#runProg').textContent=`${this.splits.length}/${this.pts.length} points`;
    gpsBadge($('#runGps'),GPS.last);
    $('#run').classList.toggle('zone',this.inZone);
    this.renderDir();
  },
  renderDir(){
    if(this.b==null){$('#runDir').textContent='—';$('#runArrowNote').textContent='';return}
    const hd=currentHeading();
    if(hd){const rel=(this.b-hd.h+360)%360;this.setArrow(rel);$('#runArrowNote').textContent=hd.src==='marche'?'🚶 marche ↑':'🧭 devant ↑';
      $('#runDir').textContent=settings.dirFormat==='clock'?`à ${clockOf(rel)} h · ${cardS(this.b)}`:`${Math.round(this.b)}° ${cardS(this.b)} · ${clockOf(rel)} h`}
    else{this.setArrow(this.b);$('#runArrowNote').textContent='nord ↑';$('#runDir').textContent=`${cardS(this.b)} · ${Math.round(this.b)}°`}
  },
  setArrow(deg){const p=this.arrowDeg==null?deg:this.arrowDeg;this.arrowDeg=p+((((deg-p)%360)+540)%360-180);$('#runArrow').style.transform=`rotate(${this.arrowDeg}deg)`},
  initMap(){
    if(!this.map){
      this.map=makeMap($('#runMap'),'run');this.pathLay=L.layerGroup().addTo(this.map);this.lay=L.layerGroup().addTo(this.map);
      this.map.on('dragstart',()=>{this.follow=false});
      this.map.on('click',e=>{if(settings.sim)GPS.simSet(e.latlng.lat,e.latlng.lng)});
    }else setMapStyle(this.map);
    this.follow=true;
    setTimeout(()=>{this.map.invalidateSize();this.redrawMap();this.fit(true)},80);
  },
  redrawMap(){
    if(!this.map||settings.profile!=='low')return;
    this.lay.clearLayers();this.meM=null;this.accC=null;
    if(!this.pathsDrawn){drawPaths(this.pathLay,Paths.get(this.c.id),mapStyleOf(this.map));this.pathsDrawn=true}
    if(settings.showDone)this.pts.slice(0,this.idx).forEach((p,i)=>L.marker([p.lat,p.lon],{icon:ctrlIcon(this.pts,i,{size:30,cls:'done'}),interactive:false}).addTo(this.lay));
    const t=this.target();if(!t)return;
    if(!this.showMe()&&this.idx>0){const pv=this.pts[this.idx-1];
      L.polyline([[pv.lat,pv.lon],[t.lat,t.lon]],{color:'#FF2BD6',weight:5,opacity:.9,interactive:false}).addTo(this.lay);
      L.marker([pv.lat,pv.lon],{icon:ctrlIcon(this.pts,this.idx-1,{size:34}),interactive:false}).addTo(this.lay)}
    L.circle([t.lat,t.lon],{radius:this.rad(),color:'#000',weight:3,fillColor:'#FFD400',fillOpacity:.25,interactive:false}).addTo(this.lay);
    this.line=L.polyline([],{color:'#FF2BD6',weight:7,dashArray:'1 14',lineCap:'round',interactive:false}).addTo(this.lay);
    const rs=PATH_STYLE[mapStyleOf(this.map)]||PATH_STYLE.map;
    this.routeCase=L.polyline([],{color:rs.routeCase,weight:19,opacity:.95,lineCap:'round',lineJoin:'round',interactive:false}).addTo(this.lay);
    this.routeLine=L.polyline([],{color:rs.route,weight:11,lineCap:'round',lineJoin:'round',interactive:false}).addTo(this.lay);
    L.marker([t.lat,t.lon],{icon:targetIcon(shortLabel(this.pts,this.idx)),interactive:false,zIndexOffset:1000}).addTo(this.lay);
    this.updateMap();
  },
  updateMap(){
    if(!this.map||settings.profile!=='low')return;
    const f=GPS.last,t=this.target();if(!f||!t)return;
    if(!this.showMe()){ /* comme en vraie course d'orientation : ni position, ni trait, ni itinéraire, carte fixe */
      if(this.meM){this.lay.removeLayer(this.meM);this.lay.removeLayer(this.accC);this.meM=null;this.accC=null}
      if(this.line)this.line.setLatLngs([]);if(this.routeLine){this.routeCase.setLatLngs([]);this.routeLine.setLatLngs([])}
      this.route=null;$('#runRoute').textContent='';return;
    }
    const ll=[f.lat,f.lon],hd=currentHeading();
    if(!this.meM){this.accC=L.circle(ll,{radius:f.acc,color:'#00B8D4',weight:2,fillOpacity:.1,interactive:false}).addTo(this.lay);this.meM=L.marker(ll,{icon:meIcon(hd?hd.h:null),interactive:false,zIndexOffset:2000}).addTo(this.lay)}
    else{this.meM.setLatLng(ll);this.meM.setIcon(meIcon(hd?hd.h:null));this.accC.setLatLng(ll).setRadius(f.acc)}
    if(settings.showRoute){if(Date.now()-this.lastRouteT>4000)this.computeRoute()}else this.route=null;
    const r=this.route;
    if(r&&this.routeLine){const cs=[ll,...r.coords,[t.lat,t.lon]];this.routeCase.setLatLngs(cs);this.routeLine.setLatLngs(cs);if(this.line)this.line.setLatLngs([])}
    else{if(this.routeLine){this.routeCase.setLatLngs([]);this.routeLine.setLatLngs([])}if(this.line)this.line.setLatLngs([ll,[t.lat,t.lon]])}
    $('#runRoute').textContent=r?`🛤 ${fmtDist(r.total)} par les chemins`:'';
    if(this.follow&&Date.now()-this.lastFit>2500)this.fit(false);
  },
  computeRoute(){this.lastRouteT=Date.now();const g=Paths.graph(this.c.id),f=GPS.last,t=this.target();this.route=(g&&f&&t)?Router.route(g,f,t):null},
  fit(force){
    if(!this.map||settings.profile!=='low')return;
    const f=GPS.last,t=this.target();if(!t)return;this.lastFit=Date.now();
    if(!this.showMe()){const pv=this.idx>0?this.pts[this.idx-1]:null;
      if(pv&&dist(pv,t)>5)this.map.fitBounds(L.latLngBounds([[pv.lat,pv.lon],[t.lat,t.lon]]),{padding:[70,70],maxZoom:18,animate:!force});
      else this.map.setView([t.lat,t.lon],17,{animate:!force});return}
    if(!f){this.map.setView([t.lat,t.lon],17);return}
    const pts=[[f.lat,f.lon],[t.lat,t.lon]].concat(this.route?this.route.coords:[]);
    this.map.fitBounds(L.latLngBounds(pts),{padding:[50,50],maxZoom:19,animate:!force});
  },
  onRecenter(){this.follow=true;this.fit(true)}
};
function holdButton(el,ms,fn){
  let t=null,start=0,raf=0;
  const reset=()=>{clearTimeout(t);t=null;cancelAnimationFrame(raf);el.style.setProperty('--p','0%')};
  const prog=()=>{el.style.setProperty('--p',Math.min(100,(Date.now()-start)/ms*100)+'%');if(t)raf=requestAnimationFrame(prog)};
  el.addEventListener('pointerdown',e=>{if(e.button>0)return;start=Date.now();clearTimeout(t);t=setTimeout(()=>{reset();vib(60);fn()},ms);prog()});
  ['pointerup','pointerleave','pointercancel'].forEach(ev=>el.addEventListener(ev,()=>{if(t)reset()}));
  el.addEventListener('contextmenu',e=>e.preventDefault());
  el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn()}});
}
const RunOpts={open:false,
  show(){if(Run.ended||this.open)return;$('#runOptsBody').appendChild($('#settingsBox'));bindSettings();Setup.compassUI();$('#runOptsSheet').hidden=false;this.open=true;setTimeout(()=>$('#runOptsTitle').focus(),50)},
  hide(){if(!this.open)return;$('#setup main').insertBefore($('#settingsBox'),$('#startRun'));$('#runOptsSheet').hidden=true;this.open=false;Run.render()}
};
$('#runOpts').onclick=()=>RunOpts.show();
$$('.runOptsClose').forEach(b=>b.onclick=()=>RunOpts.hide());
holdButton($('#runValidate'),1200,()=>{if(!Run.ended)Run.validate('manual')});
holdButton($('#runSkip'),1200,()=>{if(!Run.ended)Run.validate('skip')});
holdButton($('#runQuit'),1200,()=>Run.askQuit());
$('#runPause').onclick=()=>Run.togglePause();
const Lock={on:false,
  enable(){this.on=true;$('#lock').hidden=false;vib(100);Voice.say("Mode poche : écran verrouillé, le guidage continue. La direction est calculée d'après votre sens de marche. Pour déverrouiller, maintenir le doigt sur l'écran 3 secondes.")},
  disable(silent){if(!this.on)return;this.on=false;$('#lock').hidden=true;if(!silent){vib([60,60,60]);Voice.say('Écran déverrouillé.')}}
};
holdButton($('#lock'),3000,()=>Lock.disable());
$('#runLock').onclick=()=>Lock.enable();
$('#runTap').onclick=()=>Run.repeat();
$('#runRecenter').onclick=()=>Run.onRecenter();

/* ---------------- Résultats ---------------- */
const Results={cur:null,
  show(r){
    this.cur=r;
    $('#rsHead').innerHTML=`<p><b>${esc(r.courseName)}</b>${r.participant?' · '+esc(r.participant):''}</p><p class="hint">${new Date(r.date).toLocaleString('fr-FR')} · rayon de validation ${r.radius} m${r.finished?'':' · <b style="color:var(--warn)">épreuve arrêtée avant la fin</b>'}</p>`;
    $('#rsTotal').textContent=fmtTime(r.total);
    if(r.dist)$('#rsHead').insertAdjacentHTML('beforeend',`<p class="hint">📏 ${fmtDist(r.dist)}${r.total>30000?` · moyenne ${kmh(r.dist/(r.total/1000))}`:''}</p>`);
    const lab={auto:'auto',manual:'manuelle',skip:'passée'},hasD=r.splits.some(s=>s.d!=null&&s.type!=='start');let pd=0;
    const lg=r.splits.map(s=>{if(s.d==null||s.type==='start'||s.mode==='skip'){if(s.d!=null&&s.mode!=='skip')pd=s.d;return'–'}const ld=Math.max(0,s.d-pd);pd=s.d;return fmtDist(ld)});
    $('#rsTable').innerHTML=`<thead><tr><th>Point</th><th class="num">Inter.</th><th class="num">Cumul</th>${hasD?'<th class="num">Dist.</th>':''}<th>Valid.</th></tr></thead><tbody>${r.splits.map((s,k)=>`<tr><td>${esc(s.name)}</td><td class="num">${s.type==='start'?'–':fmtTime(s.leg)}</td><td class="num">${fmtTime(s.elapsed)}</td>${hasD?`<td class="num">${lg[k]}</td>`:''}<td><span class="tag ${s.mode}">${lab[s.mode]}</span></td></tr>`).join('')}</tbody>`;
    show('results');
  },
  fname(){const r=this.cur;return slug('resultat_'+r.courseName+(r.participant?'_'+r.participant:''))+'.gpx'},
  summary(){const r=this.cur;return[`O'Guide – ${r.courseName}${r.participant?' – '+r.participant:''}`,new Date(r.date).toLocaleString('fr-FR'),`Temps total : ${fmtTime(r.total)}${r.finished?'':' (arrêtée avant la fin)'}`,'',...r.splits.map(s=>`${s.name} : ${fmtTime(s.elapsed)}${s.type==='start'?'':' (inter. '+fmtTime(s.leg)+')'}${s.mode!=='auto'?' ['+(s.mode==='manual'?'validation manuelle':'passée')+']':''}`)].join('\n')}
};
$('#rsShare').onclick=()=>shareFile(Results.fname(),resultToGPX(Results.cur));
$('#rsDownload').onclick=()=>saveFile(Results.fname(),resultToGPX(Results.cur));
$('#rsCopy').onclick=async()=>{if(NATIVE){try{await P.share.share({title:'Résultats O\'Guide',text:Results.summary(),dialogTitle:'Envoyer le résumé'})}catch(e){}return}try{await navigator.clipboard.writeText(Results.summary());toast('Résumé copié')}catch(e){toast('Copie impossible dans ce navigateur',true)}};

/* ---------------- Démarrage ---------------- */
Voice.init();applySimUI();applyUi();Home.render();
if(!Compass.needsPerm)Compass.enable();
if(NATIVE){$('#dtDownload').textContent='💾 Enregistrer le GPX';$('#rsDownload').textContent='💾 Enregistrer (GPX)';$('#rsCopy').textContent='📤 Envoyer le résumé'}
try{history.replaceState({s:'home'},'')}catch(e){}
if(!NATIVE&&'serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
const joinHash=()=>{const m=/^#join-([0-9A-Za-z-]+)/.exec(location.hash);if(!m)return null;try{history.replaceState({s:'home'},'',location.pathname+location.search)}catch(e){}return m[1]};
/* lien organisateur : #orga-CODE.JETON */
const orgaLink=u=>{const m=/orga-([0-9A-Za-z]{6,})\.([0-9A-Za-z]{6,})/.exec(String(u||''));if(!m)return null;const code=normCode(m[1]);return validCode(code)?{code,token:m[2].toLowerCase()}:null};
const orgaHash=()=>{const r=/^#orga-/.test(location.hash)?orgaLink(location.hash):null;if(r)try{history.replaceState({s:'home'},'',location.pathname+location.search)}catch(e){}return r};
window.addEventListener('hashchange',()=>{const g=orgaHash();if(g){OrgJoin.open(g.code,g.token);return}const c=joinHash();if(c)Join.open(c)});
/* application Android ouverte par un lien oguide://join-CODE (bouton de la page web) */
const linkCode=u=>{const c=normCode(u||'');return validCode(c)?c:null};
function openFromLink(c,g){
  if(current==='run'&&!Run.ended){toast('Termine d\'abord ton épreuve en cours.',true);Voice.say('Une épreuve est en cours.');return}
  if(current==='follow'&&Follow.on){toast('Un suivi est déjà en cours.',true);return}
  if(g)OrgJoin.open(g.code,g.token);else Join.open(c);
}
if(NATIVE&&P.app){try{P.app.addListener('appUrlOpen',e=>{const u=e&&e.url,g=orgaLink(u);if(g){openFromLink(null,g);return}const c=linkCode(u);if(c)openFromLink(c)})}catch(e){}}
(async()=>{
  const g=orgaHash();if(g){OrgJoin.open(g.code,g.token);return}
  const jc=joinHash();if(jc){Join.open(jc);return}
  if(NATIVE&&P.app){try{const r=await P.app.getLaunchUrl(),u=r&&r.url,lg=orgaLink(u);if(lg){openFromLink(null,lg);return}const lc=linkCode(u);if(lc){openFromLink(lc);return}}catch(e){}}
  if(store.get(K.follow,null)){Follow.resume();return}
  const act=store.get(K.active,null);
  if(!(act&&act.course)&&settings.uiMode==='ask')await Welcome.ask();
  if(act&&act.course){Voice.say('Une épreuve n\'est pas terminée. Touchez Reprendre l\'épreuve pour continuer.');
    const v=await modal({title:'Épreuve en cours',body:`<p><b>${esc(act.course.name)}</b></p><p class="hint">Cette épreuve n'est pas terminée.</p>`,buttons:[{label:'⏯ Reprendre l\'épreuve',value:true,primary:true},{label:'Plus tard',value:false}]});
    if(v)Run.resumeActive();return}
  const dr=store.get(K.draft,null);if(dr&&dr.points&&dr.points.length){
  const v=await modal({title:'Parcours en cours de création',body:`<p>Un brouillon avec ${dr.points.length} point(s) a été retrouvé.</p>`,buttons:[{label:'Reprendre la création',value:true,primary:true},{label:'Plus tard',value:false}]});
  if(v){Create.draft=dr;Create.open()}}})();
window.OGuide={PMsg,OrgJoin,LayerPick,SpeedMeter,QUICK_P,QUICK_O,settings:()=>settings,PrintMap,Org,OrgSetup,TrainSetup,Follow,Join,Replay,RaceLink,store,K,trackDist,appIntent,RunOpts,GPS,Run,Create,Lib,parseGPX,courseToGPX,Paths,Router,Compass,tiltHeading,currentHeading,Walk,get courses(){return courses},settings:()=>settings};
})();
