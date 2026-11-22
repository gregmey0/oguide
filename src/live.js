/* ================= O'Guide : courses organisées et suivi en pratique libre =================
   Même relais et même protocole que Shadow CO : une course ou une séance créée avec l'une des deux
   applications peut être rejointe avec l'autre (O'Guide : courses en ordre imposé). */
const Sheet={open:false,onClose:null,
  show(title,node,onClose){if(this.open)this.hide();$('#sheetTitle').textContent=title;const b=$('#sheetBody');b.innerHTML='';b.appendChild(node);this.onClose=onClose||null;$('#sheet').hidden=false;this.open=true;setTimeout(()=>$('#sheetTitle').focus(),50)},
  hide(){if(!this.open)return;$('#sheet').hidden=true;this.open=false;const f=this.onClose;this.onClose=null;if(f)f()}
};
$$('.sheetClose').forEach(b=>b.onclick=()=>Sheet.hide());
const Battery={level:null,
  async init(){try{if(navigator.getBattery){const b=await navigator.getBattery();const u=()=>{this.level=Math.round(b.level*100)};u();b.addEventListener('levelchange',u)}}catch(e){}}
};
Battery.init();
const ptsOf=p=>p&&p.pts!=null?p.pts:10;
/* parcours sur la carte de l'organisateur */
function drawCourse(layer,c){
  layer.clearLayers();const pts=c.points;if(!pts.length)return null;
  if(pts.length>1)L.polyline(pts.map(p=>[p.lat,p.lon]),{color:'#FF2BD6',weight:3,opacity:.85,interactive:false}).addTo(layer);
  pts.forEach((p,i)=>L.marker([p.lat,p.lon],{icon:ctrlIcon(pts,i,{size:34}),interactive:false}).addTo(layer));
  return L.latLngBounds(pts.map(p=>[p.lat,p.lon]));
}

/* ---------------- Organiser : préparation (ordre imposé) ---------------- */
const OrgSetup={course:null,
  open(c){
    if(!c)return;this.course=c;show('orgsetup');
    $('#osCourse').innerHTML=`<p><b>${esc(c.name)}</b></p><p class="hint">${nControls(c.points)} balises · ${fmtDist(courseLength(c.points))} · ordre imposé</p>`;
    $('#osName').value=c.name+' – '+new Date().toLocaleDateString('fr-FR');
    $('#osRadius').value=String(settings.radius||10);this.sync();
  },
  sync(){const hasStart=this.course&&this.course.points.some(p=>p.type==='start');
    $('#osStartHelp').textContent=$('#osStart').value==='mass'?'Tu appuieras sur « Lancer le départ » : tous les chronos démarrent ensemble, avec une annonce vocale sur chaque téléphone.':hasStart?'Chaque coureur lance son chrono en validant le départ.':'Pas de départ dans ce parcours : le chrono démarre dès que le coureur rejoint la course.'},
  async create(){
    const c=this.course,broker=await pickBroker($('#osCreate'));if(!broker)return;
    const o={code:newCode(broker),name:$('#osName').value.trim()||c.name,created:new Date().toISOString(),status:'open',startAt:null,
      course:{id:c.id,name:c.name,mode:'ordered',timeLimit:45,penalty:10,points:c.points.map(p=>({id:p.id||uid(),lat:p.lat,lon:p.lon,type:p.type,name:p.name,desc:p.desc||''}))},
      opts:{startType:$('#osStart').value,showMe:$('#osShowMe').checked,showTrack:true,beep:true,radius:parseInt($('#osRadius').value,10)||10}};
    const all=store.get(K.orgs,[]);all.push(o);store.set(K.orgs,all.slice(-30));
    await Org.open(o);Org.showQR();
  }
};
$('#osStart').addEventListener('change',()=>OrgSetup.sync());
$('#osCreate').onclick=()=>OrgSetup.create();

/* ---------------- Impression / export de la carte d'un parcours (A4, PDF ou PNG) ----------------
   Page dessinée sur un canvas à 150 dpi : fond de carte (tuiles), surimpression de course d'orientation,
   en-tête, nord, échelle graphique, tableau des descriptions. PDF produit sans bibliothèque (image JPEG). */
const PrintMap={
  DPI:150,FONT:"Atkinson,'Atkinson Hyperlegible',system-ui,sans-serif",
  SCALES:[1000,1500,2000,2500,3000,4000,5000,7500,10000,12500,15000,20000,25000,50000],
  key(){return(typeof APP!=='undefined'&&APP.scheme==='oguide')?'oguide.print.v1':'shco.print.v1'},
  mm(v){return v*this.DPI/25.4},
  term(){return(typeof APP!=='undefined'&&APP.scheme==='oguide')?'Balise':'Poste'},
  appName(){return typeof APP!=='undefined'?APP.name:'Shadow CO'},
  appURL(){return typeof WEB_URL!=='undefined'?WEB_URL.replace(/^https:\/\//,'').replace(/\/$/,''):''},
  hasPaths(c){try{const d=(typeof Paths!=='undefined'&&Paths.get)?Paths.get(c.id):null;return!!(d&&d.ways&&d.ways.length)}catch(e){return false}},
  /* Web Mercator, pixels « monde » au zoom 20 */
  w20(lat,lon){const n=256*1048576,s=Math.sin(lat*Math.PI/180);return{X:(lon+180)/360*n,Y:(0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*n}},
  tileURL(ly,z,x,y){return ly.url.replace('{s}','abc'[(x+y)%3]).replace('{z}',z).replace('{x}',x).replace('{y}',y)},
  loadImg(src,ms=12000){return new Promise(res=>{const i=new Image();i.crossOrigin='anonymous';let done=false;const end=v=>{if(!done){done=true;clearTimeout(t);res(v)}};
    const t=setTimeout(()=>end(null),ms);i.onload=()=>end(i);i.onerror=()=>end(null);i.src=src})},
  ptsOf(p){return p&&p.pts!=null?p.pts:10},
  async render(c,o){
    const pts=c.points,mode=c.mode||'ordered',big=o.style==='big',D=this.DPI,mm=v=>this.mm(v);
    try{await document.fonts.load('700 30px Atkinson');await document.fonts.load('400 30px Atkinson')}catch(e){}
    // emprise du parcours
    const W=pts.map(p=>this.w20(p.lat,p.lon));let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
    W.forEach(q=>{x0=Math.min(x0,q.X);x1=Math.max(x1,q.X);y0=Math.min(y0,q.Y);y1=Math.max(y1,q.Y)});
    const lat0=pts.reduce((a,p)=>a+p.lat,0)/pts.length,mPerW20=156543.03392*Math.cos(lat0*Math.PI/180)/1048576;
    const bw=Math.max(x1-x0,1),bh=Math.max(y1-y0,1);
    const orient=o.orient==='auto'?(bw>bh*1.15?'land':'port'):o.orient;
    const PW=Math.round(mm(orient==='land'?297:210)),PH=Math.round(mm(orient==='land'?210:297));
    const cv=document.createElement('canvas');cv.width=PW;cv.height=PH;const g=cv.getContext('2d');
    g.fillStyle='#fff';g.fillRect(0,0,PW,PH);
    const M=mm(9),headH=mm(big?20:17),footH=mm(6);
    // tableau des descriptions
    const rows=pts.map((p,i)=>({p,i}));let legW=0,legH=0,rowH=mm(big?8.5:6.2),cols=1;
    if(o.legend){
      if(orient==='land'){legW=mm(big?78:66);const avail=PH-2*M-headH-footH-mm(10);rowH=Math.min(rowH,avail/rows.length);legH=avail}
      else{cols=rows.length>14?2:1;const nr=Math.ceil(rows.length/cols);legH=mm(10)+nr*rowH+mm(3);const maxH=(PH-2*M-headH-footH)*0.4;
        if(legH>maxH){rowH=(maxH-mm(13))/nr;legH=maxH}}
    }
    const mapX=M,mapY=M+headH,mapW=PW-2*M-(orient==='land'&&o.legend?legW+mm(5):0),mapH=PH-2*M-headH-footH-(orient==='port'&&o.legend?legH+mm(4):0);
    // échelle
    const pxM=0.0254/D;let k,den;
    const pad=mm(big?40:24),fitK=Math.min((mapW-pad)/(bw*1.08),(mapH-pad)/(bh*1.08));
    if(o.scale==='auto'){const d=mPerW20/fitK/pxM;den=this.SCALES.find(s=>s>=d)||Math.ceil(d/1000)*1000}else den=+o.scale;
    k=mPerW20/(den*pxM);
    const overflow=bw*k>mapW-pad*0.6||bh*k>mapH-pad*0.6;
    const CX=(x0+x1)/2,CY=(y0+y1)/2,toP=q=>({x:mapX+mapW/2+(q.X-CX)*k,y:mapY+mapH/2+(q.Y-CY)*k});
    // fond de carte
    g.save();g.beginPath();g.rect(mapX,mapY,mapW,mapH);g.clip();
    let ok=0,fail=0,attr='';
    const ly=(o.layer!=='none'&&o.layer!=='paths')?LAYERS[o.layer]:null;
    if(ly){
      const maxZ=(ly.o&&ly.o.maxNativeZoom)||18;let z=Math.max(3,Math.min(maxZ,Math.round(20+Math.log2(k))));
      const f=k*Math.pow(2,20-z),ts=256*f;
      const wx0=CX-mapW/2/k,wy0=CY-mapH/2/k,wx1=CX+mapW/2/k,wy1=CY+mapH/2/k,u=Math.pow(2,20-z)*256;
      const tx0=Math.floor(wx0/u),tx1=Math.floor(wx1/u),ty0=Math.floor(wy0/u),ty1=Math.floor(wy1/u),jobs=[];
      for(let tx=tx0;tx<=tx1;tx++)for(let ty=ty0;ty<=ty1;ty++)jobs.push({tx,ty});
      if(jobs.length<=200){
        const imgs=await Promise.all(jobs.map(j=>this.loadImg(this.tileURL(ly,z,j.tx,j.ty))));
        g.imageSmoothingQuality='high';
        imgs.forEach((im,i)=>{if(!im){fail++;return}ok++;const j=jobs[i],p=toP({X:j.tx*u,Y:j.ty*u});g.drawImage(im,p.x,p.y,ts+0.6,ts+0.6)});
      }
      attr=(ly.o&&ly.o.attribution)||'';
      if(o.layer==='photo'){g.fillStyle='rgba(255,255,255,.18)';g.fillRect(mapX,mapY,mapW,mapH)}
    }
    if(o.layer==='paths'&&this.hasPaths(c)){
      const d=Paths.get(c.id),wd={r:mm(1.6),l:mm(1.1),p:mm(0.8),s:mm(0.8)};
      g.lineCap='round';g.lineJoin='round';g.strokeStyle='#000';
      ['r','l','p','s'].forEach(cl=>{g.lineWidth=wd[cl]||mm(.8);g.setLineDash(cl==='s'?[mm(1.2),mm(.8)]:[]);
        d.ways.filter(w=>(w.c||'p')===cl).forEach(w=>{g.beginPath();w.n.forEach((ni,j)=>{const nd=d.nodes[ni];if(!nd)return;const p=toP(this.w20(nd[0],nd[1]));j?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y)});g.stroke()})});
      g.setLineDash([]);attr='Chemins © OpenStreetMap';
    }
    // surimpression du parcours
    const tact=o.layer==='paths',COL=tact?'#000':big?'#C8007A':'#B4009E',lw=mm(big?1.1:0.5),R=mm(big?6:3),P=pts.map((q,i)=>toP(W[i]));
    const halo=(fn)=>{g.save();g.strokeStyle='rgba(255,255,255,.85)';g.lineWidth=lw+mm(big?1.4:0.9);fn();g.stroke();g.restore();g.strokeStyle=COL;g.lineWidth=lw;fn();g.stroke()};
    const rOf=i=>pts[i].type==='start'?R*1.25:pts[i].type==='finish'?R*1.2:R;
    if(mode==='ordered'&&o.lines!==false)for(let i=1;i<P.length;i++){
      const a=P[i-1],b=P[i],dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy),ra=rOf(i-1)+mm(.8),rb=rOf(i)+mm(.8);if(L<=ra+rb)continue;
      const ux=dx/L,uy=dy/L;if(tact)g.setLineDash([mm(3),mm(2)]);halo(()=>{g.beginPath();g.moveTo(a.x+ux*ra,a.y+uy*ra);g.lineTo(b.x-ux*rb,b.y-uy*rb)});g.setLineDash([])}
    P.forEach((p,i)=>{
      const t=pts[i].type;g.lineJoin='round';
      if(t==='start'){const s=R*1.25;halo(()=>{g.beginPath();for(let a=0;a<3;a++){const an=-Math.PI/2+a*2*Math.PI/3;const x=p.x+s*Math.cos(an),y=p.y+s*Math.sin(an);a?g.lineTo(x,y):g.moveTo(x,y)}g.closePath()})}
      else if(t==='finish'){halo(()=>{g.beginPath();g.arc(p.x,p.y,R*1.2,0,7)});halo(()=>{g.beginPath();g.arc(p.x,p.y,R*0.8,0,7)})}
      else{halo(()=>{g.beginPath();g.arc(p.x,p.y,R,0,7)});if(big){g.fillStyle=COL;g.beginPath();g.arc(p.x,p.y,mm(.8),0,7);g.fill()}}
    });
    // numéros, placés à l'opposé des traits
    g.textAlign='center';g.textBaseline='middle';const fs=mm(big?9:4.6);g.font=`700 ${fs}px ${this.FONT}`;
    P.forEach((p,i)=>{
      if(pts[i].type!=='control')return;let vx=0,vy=0;
      [P[i-1],P[i+1]].forEach(q=>{if(q&&mode==='ordered'){const L=Math.hypot(q.x-p.x,q.y-p.y)||1;vx+=(q.x-p.x)/L;vy+=(q.y-p.y)/L}});
      let L=Math.hypot(vx,vy);if(L<0.2){vx=-0.7;vy=0.7;L=1}
      const d=R+fs*0.75,x=p.x-vx/L*d,y=p.y-vy/L*d,txt=shortLabel(pts,i);
      g.lineWidth=mm(big?1.6:1.1);g.strokeStyle='rgba(255,255,255,.95)';g.strokeText(txt,x,y);g.fillStyle=COL;g.fillText(txt,x,y);
    });
    g.restore();
    // cadre, nord, échelle graphique
    g.strokeStyle='#000';g.lineWidth=mm(.35);g.strokeRect(mapX,mapY,mapW,mapH);
    const nx=mapX+mapW-mm(10),ny=mapY+mm(13);
    g.fillStyle='rgba(255,255,255,.85)';g.beginPath();g.arc(nx,ny,mm(6.5),0,7);g.fill();
    g.fillStyle='#000';g.beginPath();g.moveTo(nx,ny-mm(5));g.lineTo(nx+mm(2.6),ny+mm(3.2));g.lineTo(nx,ny+mm(1.6));g.lineTo(nx-mm(2.6),ny+mm(3.2));g.closePath();g.fill();
    g.font=`700 ${mm(3.4)}px ${this.FONT}`;g.fillText('N',nx,ny-mm(8.6));
    const mPerPx=mPerW20/k,nice=[10,20,25,50,100,200,250,500,1000,2000],target=mm(35)*mPerPx,len=nice.reduce((a,b)=>Math.abs(b-target)<Math.abs(a-target)?b:a),sbw=len/mPerPx;
    const sx=mapX+mm(5),sy=mapY+mapH-mm(7);
    g.fillStyle='rgba(255,255,255,.88)';g.fillRect(sx-mm(2),sy-mm(6.5),sbw+mm(4),mm(9.5));
    g.fillStyle='#000';g.fillRect(sx,sy,sbw/2,mm(1.4));g.strokeStyle='#000';g.lineWidth=mm(.3);g.strokeRect(sx,sy,sbw,mm(1.4));
    g.font=`400 ${mm(2.8)}px ${this.FONT}`;g.textAlign='left';g.fillText('0',sx-mm(.6),sy-mm(2.6));g.textAlign='right';g.fillText(len>=1000?len/1000+' km':len+' m',sx+sbw+mm(1),sy-mm(2.6));
    // en-tête
    g.textAlign='left';g.textBaseline='alphabetic';g.fillStyle='#000';
    g.font=`700 ${mm(big?8:6.5)}px ${this.FONT}`;this.fitText(g,c.name||'Parcours',M,M+mm(big?7.5:6.2),PW-2*M-mm(48));
    const nc=pts.filter(p=>p.type==='control').length,ml=typeof MODES!=='undefined'&&MODES[mode]?MODES[mode].label:'Ordre imposé';
    let sub=`${ml} · ${nc} ${this.term().toLowerCase()}${nc>1?'s':''} · ${fmtDist(courseLength(pts))} · Échelle 1:${den.toLocaleString('fr-FR')}`;
    if(mode==='score')sub+=` · ${c.timeLimit||45} min · pénalité ${c.penalty||10} pts/min`;
    g.font=`400 ${mm(big?4.4:3.6)}px ${this.FONT}`;this.fitText(g,sub,M,M+mm(big?14.5:12),PW-2*M-mm(48));
    g.textAlign='right';g.font=`700 ${mm(3.6)}px ${this.FONT}`;g.fillText(this.appName(),PW-M,M+mm(5));
    g.font=`400 ${mm(2.8)}px ${this.FONT}`;g.fillStyle='#444';g.fillText(new Date().toLocaleDateString('fr-FR'),PW-M,M+mm(9.5));
    g.fillStyle='#000';g.strokeStyle='#000';g.lineWidth=mm(.5);g.beginPath();g.moveTo(M,M+headH-mm(2.5));g.lineTo(PW-M,M+headH-mm(2.5));g.stroke();
    // tableau des descriptions
    if(o.legend)this.legend(g,c,{x:orient==='land'?mapX+mapW+mm(5):M,y:orient==='land'?mapY:mapY+mapH+mm(4),w:orient==='land'?legW:PW-2*M,h:legH,rowH,cols,big,COL,mode});
    // pied de page
    g.textAlign='left';g.textBaseline='alphabetic';g.font=`400 ${mm(2.5)}px ${this.FONT}`;g.fillStyle='#555';
    const foot=[attr?'Fond : '+attr:'',fail&&!ok?'Fond de carte indisponible au moment de l\'export':'',`Imprimé avec ${this.appName()} · ${this.appURL()}`].filter(Boolean).join('   ·   ');
    this.fitText(g,foot,M,PH-M+mm(1),PW-2*M);
    return{canvas:cv,info:{den,orient,ok,fail,overflow,layer:o.layer}};
  },
  fitText(g,t,x,y,maxW){let s=String(t);if(g.measureText(s).width>maxW){while(s.length>1&&g.measureText(s+'…').width>maxW)s=s.slice(0,-1);s+='…'}g.fillText(s,x,y)},
  legend(g,c,b){
    const mm=v=>this.mm(v),pts=c.points,sc=b.mode==='score',T=this.term();
    g.textBaseline='middle';g.fillStyle='#000';g.font=`700 ${mm(b.big?4.6:3.8)}px ${this.FONT}`;g.textAlign='left';
    g.fillText(T==='Balise'?'Balises et indices':'Description des postes',b.x,b.y+mm(3.5));
    const nr=Math.ceil(pts.length/b.cols),cw=(b.w-(b.cols-1)*mm(5))/b.cols,top=b.y+mm(8),fs=Math.min(b.rowH*0.55,mm(b.big?4.4:3.4));
    pts.forEach((p,i)=>{
      const col=Math.floor(i/nr),r=i%nr,x=b.x+col*(cw+mm(5)),y=top+r*b.rowH,cy=y+b.rowH/2,s=Math.min(b.rowH*0.36,mm(b.big?3:2.2));
      if(r%2===0){g.fillStyle='#F3F0F6';g.fillRect(x,y,cw,b.rowH)}
      g.strokeStyle=b.COL;g.lineWidth=mm(b.big?.7:.4);const sx=x+mm(4);g.beginPath();
      if(p.type==='start'){for(let a=0;a<3;a++){const an=-Math.PI/2+a*2*Math.PI/3;const px=sx+s*Math.cos(an),py=cy+s*Math.sin(an);a?g.lineTo(px,py):g.moveTo(px,py)}g.closePath();g.stroke()}
      else if(p.type==='finish'){g.arc(sx,cy,s,0,7);g.stroke();g.beginPath();g.arc(sx,cy,s*0.6,0,7);g.stroke()}
      else{g.arc(sx,cy,s,0,7);g.stroke()}
      g.fillStyle='#000';g.font=`700 ${fs}px ${this.FONT}`;g.textAlign='left';
      const num=p.type==='start'?'Départ':p.type==='finish'?'Arrivée':`${T} ${shortLabel(pts,i)}`;g.fillText(num,x+mm(9),cy);
      const nw=g.measureText(num).width;g.font=`400 ${fs}px ${this.FONT}`;
      const right=sc&&p.type==='control'?`${this.ptsOf(p)} pts`:'';
      if(right){g.textAlign='right';g.font=`700 ${fs}px ${this.FONT}`;g.fillText(right,x+cw-mm(2),cy);g.font=`400 ${fs}px ${this.FONT}`;g.textAlign='left'}
      const desc=(p.desc||'').trim();if(desc)this.fitText(g,'– '+desc,x+mm(10)+nw,cy,cw-mm(13)-nw-(right?mm(14):0));
    });
  },
  /* PDF A4 d'une page contenant l'image JPEG */
  async pdf(cv,landscape){
    const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',0.9)),jpg=new Uint8Array(await blob.arrayBuffer());
    const W=landscape?841.89:595.28,H=landscape?595.28:841.89,enc=new TextEncoder(),parts=[],offs=[];let len=0;
    const put=x=>{const b=typeof x==='string'?enc.encode(x):x;parts.push(b);len+=b.length};
    const obj=(n,body)=>{offs[n]=len;put(`${n} 0 obj\n`);body();put('\nendobj\n')};
    put('%PDF-1.4\n');put(new Uint8Array([37,226,227,207,211,10]));
    obj(1,()=>put('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2,()=>put('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
    obj(3,()=>put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`));
    const cs=`q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(4,()=>{put(`<< /Length ${cs.length} >>\nstream\n`);put(cs);put('\nendstream')});
    obj(5,()=>{put(`<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);put(jpg);put('\nendstream')});
    const u16=t=>'<FEFF'+[...String(t)].map(ch=>{const c=ch.codePointAt(0);return c>0xFFFF?'':c.toString(16).padStart(4,'0').toUpperCase()}).join('')+'>';
    obj(6,()=>put(`<< /Title ${u16(this.lastTitle||'Parcours')} /Producer ${u16(this.appName())} /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g,'').slice(0,14)}Z) >>`));
    const xref=len;put('xref\n0 7\n0000000000 65535 f \n');for(let n=1;n<=6;n++)put(String(offs[n]).padStart(10,'0')+' 00000 n \n');
    put(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts,{type:'application/pdf'});
  },
  /* enregistrement / partage d'un fichier binaire */
  async b64(blob){const b=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode.apply(null,b.subarray(i,i+32768));return btoa(s)},
  async save(name,blob){
    if(!NATIVE){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},8000);toast('Fichier téléchargé : '+name);return}
    const dir=this.appName().replace(/[^A-Za-z]/g,'');
    try{await P.fs.writeFile({path:dir+'/'+name,data:await this.b64(blob),directory:'DOCUMENTS',recursive:true});toast(`Enregistré dans Documents › ${dir} : ${name}`)}
    catch(e){toast('Enregistrement impossible ici : utilise « Partager ».',true)}
  },
  async share(name,blob){
    if(NATIVE){try{const r=await P.fs.writeFile({path:name,data:await this.b64(blob),directory:'CACHE',recursive:true});await P.share.share({title:name,files:[r.uri],dialogTitle:'Envoyer ou imprimer '+name})}
      catch(e){if(!/cancel/i.test(String((e&&e.message)||e)))toast('Partage impossible : '+((e&&e.message)||e),true)}return}
    try{const f=new File([blob],name,{type:blob.type});if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:name});return}}catch(e){if(e&&e.name==='AbortError')return}
    this.save(name,blob);
  },
  /* feuille d'options + aperçu */
  open(c){
    if(!c||!c.points||!c.points.length){toast('Parcours vide',true);return}
    const def={layer:settings.layer||'ign',scale:'auto',orient:'auto',style:(typeof APP!=='undefined'&&APP.scheme==='oguide')?'big':'std',legend:true,lines:true};
    const o=Object.assign(def,store.get(this.key(),{}));if(o.layer==='paths'&&!this.hasPaths(c))o.layer=def.layer;
    this.c=c;this.o=o;this.res=null;
    const box=document.createElement('div');box.className='prt';
    const opt=(v,t,cur)=>`<option value="${v}"${String(cur)===String(v)?' selected':''}>${t}</option>`;
    box.innerHTML=`<label>Fond de carte<select id="prLayer">${opt('ign','Plan IGN',o.layer)}${opt('osm','OpenStreetMap',o.layer)}${opt('topo','OpenTopoMap (relief)',o.layer)}${opt('photo','Photo aérienne IGN',o.layer)}${this.hasPaths(c)?opt('paths','Chemins seuls, noir sur blanc (relief)',o.layer):''}${opt('none','Sans fond (parcours seul)',o.layer)}</select></label>
      <div class="row"><label>Échelle<select id="prScale">${opt('auto','Automatique',o.scale)}${[2500,4000,5000,7500,10000,15000].map(s=>opt(s,'1:'+s.toLocaleString('fr-FR'),o.scale)).join('')}</select></label>
      <label>Orientation<select id="prOrient">${opt('auto','Automatique',o.orient)}${opt('port','Portrait',o.orient)}${opt('land','Paysage',o.orient)}</select></label></div>
      <label>Symboles<select id="prStyle">${opt('std','Standard (course d\'orientation)',o.style)}${opt('big','Grands et épais (malvoyants)',o.style)}</select></label>
      <label class="chk"><input type="checkbox" id="prLegend"${o.legend?' checked':''}> Tableau des descriptions</label>
      ${(c.mode||'ordered')==='ordered'?`<label class="chk"><input type="checkbox" id="prLines"${o.lines!==false?' checked':''}> Traits entre les ${this.term().toLowerCase()}s</label>`:''}
      <p id="prInfo" class="hint" aria-live="polite">⏳ Préparation de la carte…</p>
      <img id="prPreview" class="prprev" alt="Aperçu de la page à imprimer">
      <div class="row"><button type="button" class="primary" id="prPdf">⬇ PDF (A4)</button><button type="button" id="prPng">⬇ Image PNG</button></div>
      <button type="button" id="prShare">📤 Partager ou imprimer le PDF</button>`;
    Sheet.show('Imprimer / exporter la carte',box);
    const read=()=>{const v=id=>{const e=box.querySelector(id);return e?e.value:null};Object.assign(this.o,{layer:v('#prLayer'),scale:v('#prScale'),orient:v('#prOrient'),style:v('#prStyle'),legend:box.querySelector('#prLegend').checked,lines:box.querySelector('#prLines')?box.querySelector('#prLines').checked:true});store.set(this.key(),this.o);this.refresh()};
    box.querySelectorAll('select,input').forEach(e=>e.addEventListener('change',read));
    box.querySelector('#prPdf').onclick=()=>this.export('pdf');box.querySelector('#prPng').onclick=()=>this.export('png');box.querySelector('#prShare').onclick=()=>this.export('share');
    this.refresh();
  },
  async refresh(){
    const n=(this.seq=(this.seq||0)+1);this.res=null;const info=$('#prInfo');if(info)info.textContent='⏳ Préparation de la carte…';
    let r;try{r=await this.render(this.c,this.o)}catch(e){if(info)info.textContent='Impossible de dessiner la carte : '+((e&&e.message)||e);return}
    if(n!==this.seq)return;this.res=r;const i=r.info,img=$('#prPreview');
    if(img)img.src=r.canvas.toDataURL('image/jpeg',0.72);
    const L={ign:'Plan IGN',osm:'OpenStreetMap',topo:'OpenTopoMap',photo:'photo aérienne',paths:'chemins seuls',none:'sans fond'}[i.layer]||'';
    let t=`A4 ${i.orient==='land'?'paysage':'portrait'} · échelle 1:${i.den.toLocaleString('fr-FR')} · fond : ${L}`;
    if(i.fail&&!i.ok)t+=' · ⚠ fond de carte indisponible (hors connexion ?) : la carte sera imprimée sans fond';else if(i.fail)t+=` · ⚠ ${i.fail} morceau${i.fail>1?'x':''} de fond manquant${i.fail>1?'s':''}`;
    if(i.overflow)t+=' · ⚠ le parcours dépasse de la page à cette échelle : choisis « Automatique » ou une échelle plus petite';
    if(info)info.textContent=t;
  },
  async export(kind){
    if(!this.res){toast('Patiente : la carte se prépare…');return}
    const name=slug(this.c.name)+'_carte'+(kind==='png'?'.png':'.pdf'),cv=this.res.canvas;this.lastTitle=this.c.name;
    const blob=kind==='png'?await new Promise(r=>cv.toBlob(r,'image/png')):await this.pdf(cv,this.res.info.orient==='land');
    if(kind==='share')await this.share(name,blob);else await this.save(name,blob);
  }
};

/* ---------------- Relais chiffré (MQTT sur WebSocket) ----------------
   Les messages passent par un relais public ; ils sont chiffrés (AES-GCM) avec une clé dérivée du code
   de la course (PBKDF2), et le nom du canal est lui aussi dérivé du code : sans le code, rien n'est lisible. */
const BROKERS={H:'wss://broker.hivemq.com:8884/mqtt',E:'wss://broker.emqx.io:8084/mqtt'};
(()=>{const t=store.get('shco.testbroker',null);if(t)BROKERS.T=t})();
const CODE_ABC='23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const WEB_URL='https://gregmey0.github.io/oguide/';
/* ouverture de l'application Android depuis la page web (QR code scanné avec l'appareil photo) */
const APP={name:'O\'Guide',scheme:'oguide',pkg:'org.oguide.app',apk:'https://github.com/gregmey0/oguide/releases/latest/download/OGuide.apk'};
function appIntent(code){const fb=location.origin+location.pathname+'?noapp=1#join-'+code;
  return`intent://join-${code}#Intent;scheme=${APP.scheme};package=${APP.pkg};S.browser_fallback_url=${encodeURIComponent(fb)};end`}
function newCode(b){const r=crypto.getRandomValues(new Uint8Array(9));return b+[...r].map(x=>CODE_ABC[x%CODE_ABC.length]).join('')}
function normCode(s){const m=/join-([0-9A-Z-]+)/i.exec(String(s||''));return(m?m[1]:String(s||'')).toUpperCase().replace(/[^0-9A-Z]/g,'')}
function validCode(c){return c.length===10&&!!BROKERS[c[0]]&&[...c.slice(1)].every(ch=>CODE_ABC.includes(ch))}
const fmtCode=c=>c.slice(0,3)+'-'+c.slice(3,6)+'-'+c.slice(6);
function joinURL(code){const base=NATIVE||!/^https?:/.test(location.protocol)?WEB_URL:location.origin+location.pathname;return base+'#join-'+code}
async function deriveRace(code){
  const enc=new TextEncoder(),base=await crypto.subtle.importKey('raw',enc.encode(code),'PBKDF2',false,['deriveBits']);
  const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode('shadowco-v1'),iterations:150000,hash:'SHA-256'},base,384));
  const key=await crypto.subtle.importKey('raw',bits.slice(0,32),'AES-GCM',false,['encrypt','decrypt']);
  return{key,tid:[...bits.slice(32,44)].map(b=>b.toString(16).padStart(2,'0')).join('')};
}
async function seal(key,obj){const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(obj))));
  const o=new Uint8Array(12+ct.length);o.set(iv);o.set(ct,12);return o}
async function unseal(key,b){const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b.slice(0,12)},key,b.slice(12));return JSON.parse(new TextDecoder().decode(pt))}

/* Client MQTT 3.1.1 minimal (QoS 0, messages retenus), reconnexion automatique */
class Mqtt{
  constructor(url){this.url=url;this.subs=new Set();this.handlers=[];this.pending=new Map();this.connected=false;this.closed=false;this.pid=1;this.retry=0;this.onstate=null;this.lastRx=0;this.lastPing=0}
  static str(s){const b=new TextEncoder().encode(s),o=new Uint8Array(2+b.length);o[0]=b.length>>8;o[1]=b.length&255;o.set(b,2);return o}
  static pkt(h,parts){const len=parts.reduce((a,p)=>a+p.length,0),lb=[];let x=len;do{let d=x%128;x=Math.floor(x/128);if(x>0)d|=128;lb.push(d)}while(x>0);
    const o=new Uint8Array(1+lb.length+len);o[0]=h;o.set(lb,1);let k=1+lb.length;for(const p of parts){o.set(p,k);k+=p.length}return o}
  connect(){
    if(this.closed)return;let ws;
    try{ws=new WebSocket(this.url,['mqtt'])}catch(e){this._later();return}
    ws.binaryType='arraybuffer';this.ws=ws;this.buf=new Uint8Array(0);
    ws.onopen=()=>{this._send(Mqtt.pkt(0x10,[Mqtt.str('MQTT'),new Uint8Array([4,2,0,40]),Mqtt.str('shco_'+Math.random().toString(36).slice(2,12))]))};
    ws.onmessage=e=>this._feed(new Uint8Array(e.data));
    ws.onclose=()=>{if(this.ws!==ws)return;const was=this.connected;this.connected=false;clearInterval(this.ka);if(was&&this.onstate)this.onstate(false);this._later()};
    ws.onerror=()=>{try{ws.close()}catch(e){}};
  }
  _later(){if(this.closed)return;clearTimeout(this.rt);this.rt=setTimeout(()=>this.connect(),Math.min(15000,800*Math.pow(1.7,this.retry++)))}
  _send(b){try{if(this.ws&&this.ws.readyState===1){this.ws.send(b);return true}}catch(e){}return false}
  _feed(chunk){
    const nb=new Uint8Array(this.buf.length+chunk.length);nb.set(this.buf);nb.set(chunk,this.buf.length);this.buf=nb;
    for(;;){const b=this.buf;if(b.length<2)return;let i=1,mult=1,rem=0,c;
      do{if(i>=b.length)return;c=b[i++];rem+=(c&127)*mult;mult*=128}while(c&128&&i<5);
      if(b.length<i+rem)return;this._handle(b[0],b.slice(i,i+rem));this.buf=b.slice(i+rem)}
  }
  _handle(h,body){
    this.lastRx=Date.now();const t=h>>4;
    if(t===2){if(body[1]!==0){try{this.ws.close()}catch(e){}return}
      this.connected=true;this.retry=0;this.lastPing=Date.now();this.subs.forEach(s=>this._sub(s));this._flush();
      clearInterval(this.ka);this.ka=setInterval(()=>{const n=Date.now();
        if(n-this.lastRx>65000){try{this.ws.close()}catch(e){}return}
        if(n-this.lastPing>20000){this.lastPing=n;this._send(new Uint8Array([0xC0,0]))}},5000);
      if(this.onstate)this.onstate(true);return}
    if(t===3){const q=(h>>1)&3,tl=(body[0]<<8)|body[1],topic=new TextDecoder().decode(body.slice(2,2+tl));let j=2+tl;if(q>0)j+=2;
      const pl=body.slice(j);this.handlers.forEach(fn=>{try{fn(topic,pl,!!(h&1))}catch(e){console.error(e)}})}
  }
  onMessage(fn){this.handlers.push(fn)}
  subscribe(t){this.subs.add(t);if(this.connected)this._sub(t)}
  _sub(t){const id=(this.pid++%65535)||1;this._send(Mqtt.pkt(0x82,[new Uint8Array([id>>8,id&255]),Mqtt.str(t),new Uint8Array([0])]))}
  publish(t,payload,retain){this.pending.set(t,{payload,retain});if(this.connected)this._flush()}
  _flush(){for(const[t,m]of[...this.pending]){if(!this._send(Mqtt.pkt(0x30|(m.retain?1:0),[Mqtt.str(t),m.payload])))return;this.pending.delete(t)}}
  waitConnected(ms){return new Promise(res=>{if(this.connected)return res(true);const t0=Date.now(),i=setInterval(()=>{if(this.connected||Date.now()-t0>ms){clearInterval(i);res(this.connected)}},100)})}
  close(){this.closed=true;clearTimeout(this.rt);clearInterval(this.ka);try{this._send(new Uint8Array([0xE0,0]));this.ws&&this.ws.close()}catch(e){}}
}

/* Trace compacte : différences entières (1e-5 degré ≈ 1 m, secondes) */
function encTrack(tr){if(!tr||!tr.length)return null;const t0=tr[0][2];let a0=0,b0=0,c0=0;const d=[];
  for(const q of tr){const a=Math.round(q[0]*1e5),b=Math.round(q[1]*1e5),c=Math.round((q[2]-t0)/1000);d.push(a-a0,b-b0,c-c0);a0=a;b0=b;c0=c}return{t0,d}}
/* distance d'une trace [lat,lon,t] en ignorant les sauts GPS (> 20 m/s) */
function trackDist(tr){let d=0;for(let i=1;i<tr.length;i++){const a=tr[i-1],b=tr[i],s=dist({lat:a[0],lon:a[1]},{lat:b[0],lon:b[1]}),dt=Math.max(1,(b[2]-a[2])/1000);if(s/dt<20)d+=s}return d}
function mergeTracks(a,b){const m=new Map();(a||[]).concat(b||[]).forEach(q=>m.set(q[2],q));return[...m.values()].sort((x,y)=>x[2]-y[2])}
function decTrack(e){const o=[];if(!e||!e.d)return o;let a=0,b=0,c=0;for(let i=0;i+2<e.d.length;i+=3){a+=e.d[i];b+=e.d[i+1];c+=e.d[i+2];o.push([a/1e5,b/1e5,e.t0+c*1000])}return o}

/* Lien coureur ↔ course */
const RaceLink={
  async connect(code,{silent}={}){
    code=normCode(code);if(!validCode(code))return null;
    const{key,tid}=await deriveRace(code),base='shco/v1/'+tid,m=new Mqtt(BROKERS[code[0]]);
    const link={code,key,base,m,race:null,connected:false,onRace:null,ownedByRun:true,
      publishState(st){seal(key,Object.assign({v:1,type:'p'},st)).then(b=>m.publish(base+'/p/'+st.pid,b,true))},
      publishTrack(pid,name,e){seal(key,Object.assign({v:1,type:'t',pid,name},e)).then(b=>m.publish(base+'/t/'+pid,b,true))},
      close(){m.close()}};
    let waiter=null;
    m.onstate=c=>{link.connected=c;if(current==='run')Run.renderNet();if(current==='follow')Follow.render()};
    m.onMessage(async(topic,pl)=>{
      if(topic!==base+'/race')return;
      if(!pl.length){link.race={status:'deleted'};if(link.onRace)link.onRace(link.race);if(waiter)waiter(link.race);return}
      try{const r=await unseal(key,pl);link.race=r;if(link.onRace)link.onRace(r);if(waiter){waiter(r);waiter=null}}catch(e){}
    });
    m.subscribe(base+'/race');m.connect();
    const r=await new Promise(res=>{waiter=res;setTimeout(()=>res(null),12000)});waiter=null;
    if(!r&&!silent){m.close();return null}
    return link;
  }
};

/* ---------------- Rejoindre une course ---------------- */
const Join={link:null,stream:null,
  open(code){
    show('join');this.appBtn(code);$('#jCode').value=code?fmtCode(normCode(code)):'';$('#jName').value=store.get(K.me,'');
    $('#jInfo').innerHTML='';$('#jConfirm').hidden=true;$('#jScan').hidden=!('BarcodeDetector' in window&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);
    if(code)this.lookup();
  },
  /* page web sur Android : proposer d'ouvrir l'application (suivi téléphone verrouillé) */
  appBtn(code){
    const c=normCode(code||''),noapp=/[?&]noapp=1/.test(location.search),ok=!NATIVE&&ANDROID&&validCode(c);
    $('#jApp').hidden=!ok||noapp;$('#jAppNo').hidden=!ok||!noapp;
    if(ok)$('#jApp').onclick=()=>{location.href=appIntent(c)};
  },
  leave(){this.stopScan();if(this.link){this.link.close();this.link=null}},
  async lookup(){
    const code=normCode($('#jCode').value);
    if(!validCode(code)){toast('Code invalide : 10 caractères, par exemple HK7-Q4M-ZP2D',true);return}
    $('#jCode').value=fmtCode(code);$('#jConfirm').hidden=true;this.appBtn(code);$('#jInfo').innerHTML='<p class="card">⏳ Recherche de la course…</p>';
    if(this.link){this.link.close();this.link=null}
    let link=null;try{link=await RaceLink.connect(code)}catch(e){}
    if(current!=='join'){if(link)link.close();return}
    if(!link){$('#jInfo').innerHTML='<p class="warnbox">Course introuvable : vérifie le code et la connexion internet.</p>';return}
    const r=link.race;
    if(r.status==='closed'||r.status==='deleted'){link.close();const t=r.kind==='train'?'Cette séance est terminée.':'Cette course est close.';$('#jInfo').innerHTML=`<p class="warnbox">${t}</p>`;Voice.say(t);return}
    if(r.kind==='train'){
      this.link=link;
      $('#jInfo').innerHTML=`<section class="card"><h2>📍 ${esc(r.name)}</h2><p>Suivi en pratique libre : rien à faire, ton téléphone envoie ta position à l'encadrant pendant la séance.</p>
        <p class="hint">Rejoins, puis range le téléphone dans la poche ou le sac.</p><p class="hint web-only">Sur navigateur, l'écran doit rester allumé (le verrouiller coupe le suivi). Avec l'appli Android, tu peux le verrouiller.</p></section>
        <p class="hint">Ta position et ta trace sont transmises à l'encadrant (chiffrées) jusqu'à la fin de la séance.</p>`;
      $('#jGo').textContent='✔ Rejoindre le suivi';$('#jConfirm').hidden=false;
      Voice.say(`Séance trouvée : ${r.name}. Suivi en pratique libre. Indiquez votre nom puis touchez Rejoindre le suivi.`);setTimeout(()=>$('#jName').focus(),50);return}
    const c=r.course;
    if(!c||(c.mode&&c.mode!=='ordered')){link.close();const t='Cette course est en ordre libre ou au score : O\'Guide guide balise par balise, dans l\'ordre. Utilise Shadow CO pour cette course.';$('#jInfo').innerHTML=`<p class="warnbox">${t}</p>`;Voice.say(t);return}
    this.link=link;const nc=nControls(c.points);
    $('#jInfo').innerHTML=`<section class="card"><h2>${esc(r.name)}</h2><p>Ordre imposé · ${nc} balise${nc>1?'s':''} · ${fmtDist(courseLength(c.points))}</p>
      <p class="hint">${r.opts.startType==='mass'?'Départ groupé donné par l\'organisateur':'Départ individuel : le chrono démarre au départ'} · validation à ${r.opts.radius||10} m${r.status==='started'?' · <b>course déjà lancée</b>':''}</p></section>
      <p class="hint">Le guidage O'Guide reste le même (voix, bips, carte malvoyant). En rejoignant, ta position et tes temps sont transmis à l'organisateur (chiffrés).</p>`;
    $('#jGo').textContent='✔ Rejoindre la course';$('#jConfirm').hidden=false;
    Voice.say(`Course trouvée : ${r.name}. ${nc} balises, dans l'ordre. ${r.opts.startType==='mass'?'Départ groupé.':'Départ individuel.'} Indiquez votre nom puis touchez Rejoindre la course.`);
    setTimeout(()=>$('#jName').focus(),50);
  },
  async join(){
    const name=$('#jName').value.trim();if(!name){toast('Indique ton nom ou ton prénom',true);Voice.say('Indiquez votre nom.');$('#jName').focus();return}
    if(!this.link){toast('Cherche d\'abord la course',true);return}
    store.set(K.me,name);Snd.unlock();Voice.unlock();
    if(this.link.race.kind==='train'){const link=this.link;this.link=null;Follow.begin({link,name});return}
    if(!await Run.checkActive())return;
    const link=this.link,r=link.race,c=r.course;this.link=null;Compass.enable();
    const course={id:'race-'+link.code,name:r.name,created:r.created,points:c.points.map(p=>({id:p.id,lat:p.lat,lon:p.lon,type:p.type,name:p.name,desc:p.desc||''}))};
    Run.open(course,name,{race:link});
  },
  async scan(){
    try{
      const det=new BarcodeDetector({formats:['qr_code']}),v=$('#jVideo');
      this.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});v.srcObject=this.stream;v.hidden=false;await v.play();
      $('#jScan').textContent='✖ Arrêter le scan';
      const loop=async()=>{if(!this.stream)return;try{const r=await det.detect(v);if(r.length){const code=normCode(r[0].rawValue);if(validCode(code)){this.stopScan();Snd.ok();vib(150);$('#jCode').value=fmtCode(code);this.lookup();return}}}catch(e){}setTimeout(loop,300)};loop();
    }catch(e){this.stopScan();toast('Caméra indisponible : saisis le code à la main.',true)}
  },
  stopScan(){if(this.stream){this.stream.getTracks().forEach(t=>t.stop());this.stream=null}const v=$('#jVideo');v.hidden=true;v.srcObject=null;$('#jScan').textContent='📷 Scanner le QR'}
};
$('#jLookup').onclick=()=>Join.lookup();
$('#jCode').addEventListener('keydown',e=>{if(e.key==='Enter')Join.lookup()});
$('#jGo').onclick=()=>Join.join();
$('#jScan').onclick=()=>{if(Join.stream)Join.stopScan();else Join.scan()};

/* ---------------- Suivi en pratique libre : côté pratiquant ----------------
   Aucun parcours, aucune info : le téléphone envoie sa position et sa trace à l'encadrant. */
const Follow={on:false,link:null,tickI:null,unsub:null,
  begin(a){
    const st=a.resume||{},link=a.link||null;
    clearInterval(this.tickI);if(this.unsub)this.unsub();
    Object.assign(this,{link,code:st.code||(link&&link.code),name:a.name||st.name||'Pratiquant',sname:(link&&link.race&&link.race.name)||st.sname||'Entraînement',
      pid:st.pid||uid(),startAt:st.startAt||Date.now(),finishAt:null,track:st.track||[],dist:st.dist||0,status:'running',on:true,lastPub:0,lastTrk:0,lastSave:0});
    if(link)link.onRace=r=>this.onRace(r);
    show('follow');
    $('#fwTitle').textContent='Suivi en cours';$('#fwIcon').textContent='📍';$('#fwIcon').classList.add('on');$('#fwName').textContent=this.sname;
    $('#fwStop').hidden=false;$('#fwHome').hidden=true;$('#fwHint').hidden=false;
    GPS.start();this.unsub=GPS.on(f=>this.onFix(f));if(!NATIVE)Wake.on();
    this.tickI=setInterval(()=>this.tick(),1000);
    this.save();this.publish(true);this.render();
    if(!a.resume){vib([150,80,150]);toast('📍 Suivi lancé : tu peux ranger le téléphone.');Voice.say(`Suivi lancé pour la séance ${this.sname}. Vous pouvez ranger le téléphone.`)}else Voice.say('Suivi repris.')
    if(link&&link.race)this.onRace(link.race);
  },
  onFix(f){
    if(!this.on)return;
    let first=false;
    if(f.acc<=30){const tr=this.track,l=tr[tr.length-1],p=[+f.lat.toFixed(6),+f.lon.toFixed(6),Date.now()];
      if(!l){tr.push(p);first=true}else{const d=dist({lat:l[0],lon:l[1]},{lat:p[0],lon:p[1]});if(d>=5){if(d/Math.max(1,(p[2]-l[2])/1000)<20)this.dist+=d;tr.push(p);if(tr.length>20000)tr.splice(0,tr.length-20000)}}}
    this.publish(first);this.saveSoon();
  },
  tick(){if(!this.on)return;this.publish();this.saveSoon();this.render()},
  publish(force){
    if(!this.link)return;const now=Date.now();if(!force&&now-this.lastPub<5000)return;this.lastPub=now;const f=GPS.last;
    this.link.publishState({pid:this.pid,name:this.name,kind:'train',status:this.status,startAt:this.startAt,finishAt:this.finishAt,dist:Math.round(this.dist),
      pos:f?{lat:+f.lat.toFixed(6),lon:+f.lon.toFixed(6),acc:f.sim?3:Math.round(f.acc),t:f.t,sim:f.sim?1:undefined}:null,bat:Battery.level,app:NATIVE?'android':'web',upd:now});
    if(force||now-this.lastTrk>30000){this.lastTrk=now;const e=encTrack(this.track.slice(-4000));if(e)this.link.publishTrack(this.pid,this.name,e)}
  },
  saveSoon(){if(Date.now()-this.lastSave>20000)this.save()},
  save(){if(!this.on)return;this.lastSave=Date.now();
    store.set(K.follow,{code:this.code,name:this.name,sname:this.sname,pid:this.pid,startAt:this.startAt,dist:this.dist,track:this.track.slice(-3000)})},
  onRace(r){if(!this.on||!r)return;if(r.name&&r.name!==this.sname){this.sname=r.name;$('#fwName').textContent=r.name}
    if(r.status==='closed'||r.status==='deleted')this.stop('closed')},
  async askStop(){
    const v=await modal({title:'Arrêter le suivi ?',body:'<p>L\'encadrant ne verra plus tes déplacements.</p>',buttons:[{label:'Continuer le suivi',value:false,primary:true},{label:'⏹ Arrêter',value:true,danger:true}]});
    if(v)this.stop('stopped');
  },
  stop(status){
    if(!this.on)return;
    this.status=status;this.finishAt=Date.now();this.publish(true);
    this.on=false;clearInterval(this.tickI);if(this.unsub)this.unsub();this.unsub=null;
    store.del(K.follow);GPS.stop();Wake.off();vib([300,100,300]);
    const link=this.link;setTimeout(()=>{if(link)link.close();if(this.link===link)this.link=null},4000);
    if(current!=='follow')show('follow');
    $('#fwIcon').classList.remove('on');$('#fwIcon').textContent='✅';$('#fwTitle').textContent='Suivi terminé';
    $('#fwState').textContent=status==='closed'?'L\'encadrant a terminé la séance.':'Tu as arrêté le suivi.';Voice.say(status==='closed'?'Suivi terminé : l\'encadrant a terminé la séance.':'Suivi arrêté.');
    $('#fwStop').hidden=true;$('#fwHome').hidden=false;$('#fwHint').hidden=true;
  },
  render(){
    if(current!=='follow'||!this.on)return;const f=GPS.last,net=this.link&&this.link.connected;
    $('#fwState').textContent=`${net?'📡 Connecté':'📡✖ Hors ligne : envoi au retour du réseau'} · ${f&&Date.now()-f.t<30000?'🛰 GPS OK':'🛰 GPS : recherche…'}`;
  },
  async resume(){
    const a=store.get(K.follow,null);if(!a)return;
    if(this.on){show('follow');return}
    let link=null;try{link=await RaceLink.connect(a.code,{silent:true})}catch(e){}
    if(link&&link.race&&(link.race.status==='closed'||link.race.status==='deleted')){link.close();store.del(K.follow);toast('Cette séance est terminée.');Home.render();return}
    if(link&&!link.race)toast('Relais injoignable : le suivi reprend, les données partiront dès le retour du réseau.',true);
    this.begin({link,name:a.name,resume:a});
  },
  onResumeVisible(){if(this.on){this.publish(true);this.render()}}
};
holdButton($('#fwStop'),1500,()=>Follow.askStop());

/* relais : serveur de test éventuel, puis HiveMQ, puis EMQX */
async function pickBroker(b){
  const old=b.textContent;b.disabled=true;b.textContent='⏳ Connexion au relais…';let broker=null;
  for(const k of['T','H','E']){if(!BROKERS[k])continue;const m=new Mqtt(BROKERS[k]);m.connect();const ok=await m.waitConnected(7000);m.close();if(ok){broker=k;break}}
  b.disabled=false;b.textContent=old;
  if(!broker)toast('Relais injoignable : vérifie la connexion internet puis réessaie.',true);return broker;
}

/* ---------------- Suivi en pratique libre : création (sans parcours) ---------------- */
const TrainSetup={
  async open(){
    const r=await modal({title:'📍 Suivi en pratique libre',body:'<p>Pas de parcours : les pratiquants rejoignent avec le code ou le QR code et rangent leur téléphone. Tu suis leurs déplacements sur la carte en direct, puis en replay.</p>',
      input:{value:'Pratique libre – '+new Date().toLocaleDateString('fr-FR'),placeholder:'Nom de la séance'},buttons:[{label:'📡 Créer la séance',value:true,primary:true},{label:'Annuler',value:false}]});
    if(!r||!r.value)return;
    const broker=await pickBroker($('#hTrain'));if(!broker)return;
    const o={kind:'train',code:newCode(broker),name:r.text||'Pratique libre',created:new Date().toISOString(),status:'open',startAt:Date.now(),course:null,opts:{}};
    const all=store.get(K.orgs,[]);all.push(o);store.set(K.orgs,all.slice(-30));
    await Org.open(o);Org.showQR();
  }
};
$('#hTrain').onclick=()=>TrainSetup.open();


/* ---------------- Organiser : suivi en direct ---------------- */
/* coureurs O'Guide : 👂 non-voyant, 👁 malvoyant */
const profIcon=st=>st.og==='blind'?' 👂':st.og==='low'?' 👁':'';
const PALETTE=['#E6194B','#3CB44B','#4363D8','#F58231','#911EB4','#42D4F4','#F032E6','#9A6324','#000075','#808000','#469990','#DC143C','#2E8B57','#8B008B','#FF4500','#1E90FF'];
const Org={map:null,lay:null,runLay:null,o:null,m:null,key:null,base:null,runners:{},trails:{},tracks:{},tickI:null,focus:null,lastSave:0,
  statusLabel(s,kind){return(kind==='train'?{open:'en cours',closed:'terminée',deleted:'archivée'}:{open:'inscriptions ouvertes',started:'en cours',closed:'close',deleted:'archivée'})[s]||s},
  isTrain(){return!!this.o&&this.o.kind==='train'},
  fitAll(){const b=L.latLngBounds([]);if(this.o.course)this.o.course.points.forEach(p=>b.extend([p.lat,p.lon]));
    Object.keys(this.runners).forEach(pid=>{const st=this.runners[pid];if(st.pos)b.extend([st.pos.lat,st.pos.lon]);if(this.isTrain())this.fullTrack(pid).forEach(q=>b.extend([q[0],q[1]]))});
    if(b.isValid()){this.map.fitBounds(b,{padding:[30,30],maxZoom:18});return true}return false},
  dataKey(){return'oguide.orgdata.'+this.o.code},
  saveData(){if(!this.o)return;this.lastSave=Date.now();const tr={};Object.keys(this.runners).forEach(pid=>{const e=encTrack(this.fullTrack(pid));if(e)tr[pid]=e});
    if(!store.set(this.dataKey(),{runners:this.runners,tracks:tr,saved:Date.now()}))toast('Mémoire pleine : exporte les résultats.',true)},
  saveSoon(){if(Date.now()-this.lastSave>15000)this.saveData()},
  /* trace la plus complète : trace envoyée par le coureur + positions reçues en direct */
  fullTrack(pid){const a=(this.tracks[pid]||[]).concat(this.trails[pid]||[]).sort((x,y)=>x[2]-y[2]),o=[];
    for(const q of a){const l=o[o.length-1];if(!l||q[2]-l[2]>=1500)o.push(q)}return o},
  save(){const all=store.get(K.orgs,[]),i=all.findIndex(x=>x.code===this.o.code);if(i>=0)all[i]=this.o;else all.push(this.o);store.set(K.orgs,all)},
  resume(code){const o=store.get(K.orgs,[]).find(x=>x.code===code);if(o)this.open(o)},
  async open(o){
    this.o=o;this.runners={};this.trails={};this.tracks={};this.focus=null;Replay.close(true);show('org');
    const sd=store.get('oguide.orgdata.'+o.code,null);
    if(sd){this.runners=sd.runners||{};Object.entries(sd.tracks||{}).forEach(([pid,e])=>{this.tracks[pid]=decTrack(e)})}
    $('#orgTitle').textContent=o.name;const tr=o.kind==='train';
    $('#orgRank').textContent=tr?'📊 Bilan':'📊 Classement';$('#orgClose').textContent=tr?'⏹ Terminer':'🏁 Clore';
    if(!this.map){this.map=makeMap($('#orgMap'),'org');this.lay=L.layerGroup().addTo(this.map);this.runLay=L.layerGroup().addTo(this.map)}else setMapStyle(this.map);
    const b=tr?(this.lay.clearLayers(),null):drawCourse(this.lay,o.course);this.fitted=false;
    setTimeout(()=>{this.map.invalidateSize();if(b)this.map.fitBounds(b,{padding:[30,30],maxZoom:18});else if(tr){this.fitted=this.fitAll();if(!this.fitted&&GPS.last)this.map.setView([GPS.last.lat,GPS.last.lon],15)}},80);
    this.render();
    if(o.status==='deleted'){$('#orgNet').textContent='🗄';$('#orgNet').title='Course archivée sur cet appareil';return}
    const{key,tid}=await deriveRace(o.code);this.key=key;this.base='shco/v1/'+tid;
    if(this.m)this.m.close();const m=this.m=new Mqtt(BROKERS[o.code[0]]);
    m.onstate=c=>{$('#orgNet').textContent=c?'📡':'📡✖';$('#orgNet').title=c?'Connecté au relais':'Relais injoignable, nouvel essai…';if(c)this.publishRace()};
    m.onMessage(async(topic,pl)=>{
      if(!pl.length)return;
      if(topic.startsWith(this.base+'/t/')){try{const t=await unseal(this.key,pl);if(t&&t.pid){this.tracks[t.pid]=mergeTracks(this.tracks[t.pid],decTrack(t));this.saveSoon()}}catch(e){}return}
      if(!topic.startsWith(this.base+'/p/'))return;
      try{const st=await unseal(this.key,pl);if(st&&st.pid)this.onRunner(st)}catch(e){}
    });
    m.subscribe(this.base+'/p/+');m.subscribe(this.base+'/t/+');m.connect();
    clearInterval(this.tickI);this.tickI=setInterval(()=>{if(current==='org')this.render()},1000);
  },
  leave(){Replay.close(true);clearInterval(this.tickI);if(this.o&&Object.keys(this.runners).length)this.saveData();if(this.m){this.m.close();this.m=null}},
  raceMsg(){const o=this.o,c=o.course;return{v:1,type:'race',kind:o.kind||'race',name:o.name,course:c?{mode:c.mode,timeLimit:c.timeLimit,penalty:c.penalty,points:c.points}:null,opts:o.opts,status:o.status,startAt:o.startAt,created:o.created}},
  async publishRace(){if(!this.m||!this.key||this.o.status==='deleted')return;this.m.publish(this.base+'/race',await seal(this.key,this.raceMsg()),true)},
  onRunner(st){
    const prev=this.runners[st.pid];if(prev&&prev.upd>st.upd)return;
    this.runners[st.pid]=st;
    if(st.pos){const tr=this.trails[st.pid]||(this.trails[st.pid]=[]),l=tr[tr.length-1];if(!l||l[2]!==st.pos.t){tr.push([st.pos.lat,st.pos.lon,st.pos.t]);if(tr.length>400)tr.shift()}}
    if(this.isTrain()&&!this.fitted&&st.pos&&this.map){this.fitted=true;this.map.setView([st.pos.lat,st.pos.lon],Math.max(this.map.getZoom(),16))}
    this.saveSoon();if(current==='org')this.render();
  },
  color(pid){let h=0;for(const ch of pid)h=(h*31+ch.charCodeAt(0))>>>0;return PALETTE[h%PALETTE.length]},
  ptById(id){return this.o.course.points.find(p=>p.id===id)},
  info(st){
    if(this.isTrain())return this.trainInfo(st);
    const c=this.o.course,now=Date.now(),pts=c.points,ctrls=pts.filter(p=>p.type==='control');
    const vis=(st.visited||[]).map(v=>Object.assign({},v,{p:pts.find(p=>p.id===v.id)})).filter(v=>v.p);
    const done=vis.filter(v=>v.p.type==='control').length,last=vis[vis.length-1];
    const el=st.startAt?((st.finishAt||now)-st.startAt):null;
    const tr=this.trails[st.pid]||[],age=st.upd?now-st.upd:Infinity;
    let immobile=false;if(st.status==='running'&&tr.length>2){const recent=tr.filter(q=>now-q[2]<300000);if(recent.length>2&&now-recent[0][2]>240000){const c0={lat:recent[0][0],lon:recent[0][1]};immobile=recent.every(q=>dist(c0,{lat:q[0],lon:q[1]})<25)}}
    return{done,n:ctrls.length,last,el,age,stale:age>90000&&(st.status==='running'||st.status==='waiting'),immobile,missing:ctrls.length-done,manual:vis.some(v=>v.m==='manual')};
  },
  trainInfo(st){
    const now=Date.now(),age=st.upd?now-st.upd:Infinity,stale=age>90000&&st.status==='running';
    const end=st.finishAt||(stale?st.upd:now),el=st.startAt?Math.max(0,end-st.startAt):null,ft=this.fullTrack(st.pid);
    const d=Math.max(st.dist||0,trackDist(ft)),tr=this.trails[st.pid]||[];
    let immobile=false;if(st.status==='running'){const recent=tr.filter(q=>now-q[2]<300000);if(recent.length>2&&now-recent[0][2]>240000){const c0={lat:recent[0][0],lon:recent[0][1]};immobile=recent.every(q=>dist(c0,{lat:q[0],lon:q[1]})<25)}}
    return{train:true,el,dist:d,speed:el>30000&&d>0?d/(el/1000):null,age,stale,immobile,n:ft.length,done:0,missing:0,last:null,manual:false};
  },
  speedTxt(i){if(!i.speed)return'—';const kmh=i.speed*3.6,pace=1000/i.speed;return kmh.toFixed(1).replace('.',',')+' km/h'+(kmh<25?' · '+fmtTime(pace*1000)+'/km':'')},
  ranking(){
    if(this.isTrain()){const g=s=>s==='running'?0:1;return Object.values(this.runners).map(st=>({st,i:this.info(st)})).sort((a,b)=>g(a.st.status)-g(b.st.status)||a.st.name.localeCompare(b.st.name,'fr'))}
    const sc=this.o.course.mode==='score',arr=Object.values(this.runners).map(st=>({st,i:this.info(st)}));
    const grp=s=>({finished:0,running:1,waiting:2,closed:3,abandoned:4}[s]??5);
    arr.sort((a,b)=>{const g=grp(a.st.status)-grp(b.st.status);if(g)return g;
      if(sc){if((b.st.net||0)!==(a.st.net||0))return(b.st.net||0)-(a.st.net||0);return(a.i.el||0)-(b.i.el||0)}
      if(a.st.status==='finished'){if(a.i.missing!==b.i.missing)return a.i.missing-b.i.missing;return(a.i.el||0)-(b.i.el||0)}
      if(b.i.done!==a.i.done)return b.i.done-a.i.done;return((a.i.last&&a.i.last.el)||0)-((b.i.last&&b.i.last.el)||0)});
    return arr;
  },
  stLabel(st,i){
    if(this.isTrain())return st.status==='running'?'📍 suivi actif':st.status==='stopped'?'⏹ arrêté par le pratiquant':'⏹ séance terminée';
    if(st.status==='waiting')return'⏳ en attente';if(st.status==='abandoned')return'✖ abandon';if(st.status==='closed')return'⏹ arrêtée';
    if(st.status==='finished')return'🏁 arrivé';return'🏃 en course';
  },
  render(){
    const o=this.o;if(!o||Replay.on)return;
    $('#orgStatus').textContent=this.statusLabel(o.status);$('#orgStatus').className='tag st-'+o.status;
    $('#orgStatus').textContent=this.statusLabel(o.status,o.kind);
    $('#orgLaunch').hidden=!(o.opts.startType==='mass'&&o.status==='open');$('#orgClose').hidden=o.status==='closed'||o.status==='deleted';$('#orgQR').hidden=o.status==='deleted';
    if(this.isTrain()){this.renderTrain();return}
    const sc=o.course.mode==='score',rk=this.ranking(),now=Date.now();
    const cnt={running:0,finished:0,waiting:0};rk.forEach(r=>{if(cnt[r.st.status]!=null)cnt[r.st.status]++});
    const raceEl=o.startAt?now-o.startAt:null;
    $('#orgCount').innerHTML=`<b>${rk.length}</b> coureur${rk.length>1?'s':''} · ${cnt.running} en course · ${cnt.finished} arrivé${cnt.finished>1?'s':''} · ${cnt.waiting} en attente${raceEl!=null&&o.status==='started'?` · ⏱ ${fmtTime(raceEl)}`:''}`;
    $('#orgList').innerHTML=rk.length?rk.map(({st,i},k)=>{
      const col=this.color(st.pid),lastTxt=i.last?(i.last.p.type==='finish'?'arrivée':i.last.p.type==='start'?'départ':'balise '+shortLabel(o.course.points,o.course.points.indexOf(i.last.p)))+' à '+fmtTime(i.last.el):'—';
      const alerts=(i.stale?`<span class="al">📡 sans nouvelles depuis ${fmtTime(i.age)}</span>`:'')+(i.immobile?'<span class="al">⚠ immobile depuis 4 min</span>':'')+(i.manual?'<span class="al soft">validation manuelle</span>':'');
      return`<li><button type="button" class="runner${this.focus===st.pid?' sel':''}" data-pid="${st.pid}"><span class="dot" style="background:${col}">${k+1}</span><span class="rn"><b>${esc(st.name)}</b><small>${this.stLabel(st,i)} · ${sc?`${st.net||0} pts · `:''}${i.done}/${i.n} balises · dernière : ${lastTxt}</small>${alerts?`<small>${alerts}</small>`:''}</span><span class="rt">${i.el!=null?fmtTime(i.el):'—'}<small>${st.bat!=null?'🔋'+st.bat+'%':''}${st.app==='android'?' 🤖':''}${profIcon(st)}</small></span></button></li>`}).join('')
      :`<li class="hint">Personne n'a encore rejoint la course. Montre le QR code ou donne le code <b>${fmtCode(o.code)}</b>.</li>`;
    this.drawRunners();
  },
  renderTrain(){
    const o=this.o,rk=this.ranking(),act=rk.filter(r=>r.st.status==='running').length,ses=o.startAt?Date.now()-o.startAt:null;
    $('#orgCount').innerHTML=`<b>${rk.length}</b> pratiquant${rk.length>1?'s':''} · ${act} suivi${act>1?'s':''} actif${act>1?'s':''}${ses!=null&&o.status==='open'?` · séance depuis ${fmtTime(ses)}`:''}`;
    $('#orgList').innerHTML=rk.length?rk.map(({st,i})=>{
      const col=this.color(st.pid),ini=st.name.split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();
      const alerts=(i.stale?`<span class="al">📡 sans nouvelles depuis ${fmtTime(i.age)}</span>`:'')+(i.immobile?'<span class="al">⚠ immobile depuis 4 min</span>':'');
      return`<li><button type="button" class="runner${this.focus===st.pid?' sel':''}" data-pid="${st.pid}"><span class="dot" style="background:${col}">${esc(ini)}</span><span class="rn"><b>${esc(st.name)}</b><small>${this.stLabel(st,i)} · ${fmtDist(i.dist)} · ${this.speedTxt(i)}</small>${alerts?`<small>${alerts}</small>`:''}</span><span class="rt">${i.el!=null?fmtTime(i.el):'—'}<small>${st.bat!=null?'🔋'+st.bat+'%':''}${st.app==='android'?' 🤖':''}${profIcon(st)}</small></span></button></li>`}).join('')
      :`<li class="hint">Personne n'a encore rejoint la séance. Montre le QR code ou donne le code <b>${fmtCode(o.code)}</b>.</li>`;
    this.drawRunners();
  },
  drawRunners(){
    this.runLay.clearLayers();const now=Date.now();
    Object.values(this.runners).forEach(st=>{
      if(!st.pos)return;const col=this.color(st.pid),i=this.info(st),tr=this.fullTrack(st.pid);
      if(tr.length>1)L.polyline(tr.map(q=>[q[0],q[1]]),{color:col,weight:3,opacity:.6,interactive:false}).addTo(this.runLay);
      const ini=st.name.split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();
      L.marker([st.pos.lat,st.pos.lon],{icon:L.divIcon({className:'rmk'+(i.stale?' stale':'')+(i.immobile?' alert':'')+(this.focus===st.pid?' sel':''),html:`<span style="background:${col}">${esc(ini)}</span><em>${esc(st.name)}</em>`,iconSize:[34,34],iconAnchor:[17,17]}),zIndexOffset:this.focus===st.pid?3000:1000})
        .on('click',()=>this.select(st.pid)).addTo(this.runLay);
    });
  },
  select(pid){
    this.focus=this.focus===pid?null:pid;const st=this.runners[pid];
    if(this.focus&&st&&st.pos)this.map.setView([st.pos.lat,st.pos.lon],Math.max(this.map.getZoom(),17));
    this.render();
    if(this.focus&&st)this.showRunner(st);
  },
  showRunner(st){
    if(this.isTrain()){
      const i=this.info(st),box=document.createElement('div');
      box.innerHTML=`<p><b>${esc(st.name)}</b> · ${this.stLabel(st,i)}</p>
        <table class="res"><tbody><tr><td>Durée</td><td class="num">${i.el!=null?fmtTime(i.el):'—'}</td></tr><tr><td>Distance</td><td class="num">${fmtDist(i.dist)}</td></tr><tr><td>Vitesse moyenne</td><td class="num">${this.speedTxt(i)}</td></tr>
        <tr><td>Dernière position</td><td class="num">${st.pos?'il y a '+fmtTime(Date.now()-st.pos.t):'—'}</td></tr><tr><td>Batterie</td><td class="num">${st.bat!=null?st.bat+' %':'—'}</td></tr><tr><td>Points GPS</td><td class="num">${i.n}</td></tr></tbody></table>
        <div class="row" style="margin-top:1rem"><button type="button" id="srGpx">🗺 Trace GPX</button></div>`;
      Sheet.show('Pratiquant',box);$('#srGpx').onclick=()=>this.exportGPX([st.pid]);return}
    const c=this.o.course,i=this.info(st),sc=c.mode==='score';
    const rows=(st.visited||[]).map(v=>{const p=c.points.find(q=>q.id===v.id);if(!p)return'';const lbl=p.type==='start'?'▲ Départ':p.type==='finish'?'🏁 Arrivée':'Balise '+shortLabel(c.points,c.points.indexOf(p));
      return`<tr><td>${lbl}${v.m==='manual'?' <span class="tag manual">manuel</span>':''}</td><td class="num">${p.type==='start'?'–':fmtTime(v.leg)}</td><td class="num">${fmtTime(v.el)}</td>${sc?`<td class="num">${p.type==='control'?ptsOf(p):''}</td>`:''}</tr>`}).join('');
    const box=document.createElement('div');
    box.innerHTML=`<p><b>${esc(st.name)}</b>${profIcon(st)} · ${this.stLabel(st,i)}</p><p class="hint">${i.done}/${i.n} balises${sc?` · ${st.score||0} pts − ${st.pen||0} = <b>${st.net||0}</b>`:''}${i.el!=null?' · '+fmtTime(i.el):''}${st.pos?` · position il y a ${fmtTime(Date.now()-st.pos.t)}`:''}</p>
      <table class="res"><thead><tr><th>Balise</th><th class="num">Inter.</th><th class="num">Cumul</th>${sc?'<th class="num">Pts</th>':''}</tr></thead><tbody>${rows||'<tr><td colspan="4">Aucune balise validée</td></tr>'}</tbody></table>`;
    Sheet.show('Coureur',box);
  },
  exportGPX(pids){
    const o=this.o,xe=s=>esc(s);pids=pids||Object.keys(this.runners);
    const trk=pids.map(pid=>{const st=this.runners[pid],tr=this.fullTrack(pid);if(!st||tr.length<2)return'';
      return`<trk><name>${xe(st.name)}</name><trkseg>\n${tr.map(q=>`<trkpt lat="${q[0].toFixed(6)}" lon="${q[1].toFixed(6)}"><time>${new Date(q[2]).toISOString()}</time></trkpt>`).join('\n')}\n</trkseg></trk>`}).filter(Boolean);
    if(!trk.length){toast('Pas encore de trace à exporter.',true);return}
    const gpx=`<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="O'Guide" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>${xe(o.name)}</name><time>${o.created}</time></metadata>\n${trk.join('\n')}\n</gpx>`;
    saveFile(slug('traces_'+o.name+(pids.length===1&&this.runners[pids[0]]?'_'+this.runners[pids[0]].name:''))+'.gpx',gpx,'application/gpx+xml');
  },
  async launch(){
    const n=Object.values(this.runners).filter(r=>r.status==='waiting').length;
    const v=await modal({title:'Lancer le départ ?',body:`<p>${n} coureur${n>1?'s':''} en attente. Tous les chronos démarrent maintenant.</p>`,buttons:[{label:'▶ Lancer',value:true,primary:true},{label:'Annuler',value:false}]});
    if(!v)return;this.o.status='started';this.o.startAt=Date.now();this.save();await this.publishRace();Snd.fanfare();vib([300,100,300]);toast('🏁 Départ lancé !');this.render();
  },
  async close(){
    const tr=this.isTrain();
    const v=await modal(tr?{title:'Terminer la séance ?',body:'<p>Le suivi s\'arrête sur tous les téléphones. Le bilan et le replay restent disponibles.</p>',buttons:[{label:'⏹ Terminer',value:true,danger:true},{label:'Annuler',value:false}]}
      :{title:'Clore la course ?',body:'<p>Les coureurs encore en course sont arrêtés et leurs temps enregistrés.</p>',buttons:[{label:'🏁 Clore',value:true,danger:true},{label:'Annuler',value:false}]});
    if(!v)return;this.o.status='closed';this.save();await this.publishRace();toast(tr?'Séance terminée':'Course close');setTimeout(()=>{if(this.o)this.saveData()},6000);this.render();
  },
  showQR(){
    const o=this.o,url=joinURL(o.code),q=qrcode(0,'M');q.addData(url);q.make();
    const box=document.createElement('div');box.className='qrbox';
    box.innerHTML=`<div class="qr">${q.createSvgTag({cellSize:8,margin:2,scalable:true})}</div><p class="code">${fmtCode(o.code)}</p>
      <p class="hint">${o.kind==='train'?'Les pratiquants':'Les coureurs'} scannent ce QR code avec l'appareil photo, ou choisissent « Rejoindre » sur l'accueil et tapent le code.</p><p class="hint url">${esc(url)}</p>
      <div class="row"><button type="button" id="qrShare">📤 Partager le lien</button><button type="button" id="qrCopy">📋 Copier</button></div>`;
    Sheet.show('Rejoindre : '+o.name,box);
    $('#qrCopy').onclick=async()=>{try{await navigator.clipboard.writeText(url);toast('Lien copié')}catch(e){toast('Copie impossible : '+url,true)}};
    $('#qrShare').onclick=async()=>{const text=`Rejoins ${o.kind==='train'?'la séance':'la course'} « ${o.name} » sur O'Guide : ${url} (code ${fmtCode(o.code)})`;
      try{if(NATIVE)await P.share.share({title:'O\'Guide',text,dialogTitle:'Envoyer le lien'});else if(navigator.share)await navigator.share({title:'O\'Guide',text});else{await navigator.clipboard.writeText(text);toast('Lien copié')}}catch(e){}};
  },
  showRanking(){
    if(this.isTrain()){
      const rk=this.ranking(),box=document.createElement('div');
      box.innerHTML=`<table class="res"><thead><tr><th>Nom</th><th class="num">Durée</th><th class="num">Distance</th><th class="num">Vitesse</th></tr></thead><tbody>${rk.map(({st,i})=>`<tr data-pid="${st.pid}"><td>${esc(st.name)}<br><small class="muted">${this.stLabel(st,i)}</small></td><td class="num">${i.el!=null?fmtTime(i.el):'—'}</td><td class="num">${fmtDist(i.dist)}</td><td class="num">${i.speed?(i.speed*3.6).toFixed(1).replace('.',',')+' km/h':'—'}</td></tr>`).join('')||'<tr><td colspan="4">Personne pour l\'instant</td></tr>'}</tbody></table>
        <div class="row" style="margin-top:1rem"><button type="button" id="rkCsv">⬇ Bilan CSV (tableur)</button><button type="button" id="rkGpx">🗺 Traces GPX</button></div>`;
      Sheet.show('Bilan de la séance',box);
      box.querySelector('tbody').addEventListener('click',e=>{const tr=e.target.closest('[data-pid]');if(tr){Sheet.hide();this.select(tr.dataset.pid)}});
      $('#rkCsv').onclick=()=>this.exportCSV();$('#rkGpx').onclick=()=>this.exportGPX();return}
    const sc=this.o.course.mode==='score',rk=this.ranking(),box=document.createElement('div');
    box.innerHTML=`<table class="res"><thead><tr><th>#</th><th>Nom</th><th class="num">${sc?'Points':'Balises'}</th><th class="num">Temps</th></tr></thead><tbody>${rk.map(({st,i},k)=>`<tr data-pid="${st.pid}"><td>${st.status==='finished'?k+1:'–'}</td><td>${esc(st.name)}${profIcon(st)}<br><small class="muted">${this.stLabel(st,i)}</small></td><td class="num">${sc?(st.net||0):i.done+'/'+i.n}</td><td class="num">${i.el!=null?fmtTime(i.el):'—'}</td></tr>`).join('')||'<tr><td colspan="4">Aucun coureur</td></tr>'}</tbody></table>
      <div class="row" style="margin-top:1rem"><button type="button" id="rkCsv">⬇ Résultats CSV (tableur)</button></div>`;
    Sheet.show('Classement',box);
    box.querySelector('tbody').addEventListener('click',e=>{const tr=e.target.closest('[data-pid]');if(tr){Sheet.hide();this.select(tr.dataset.pid)}});
    $('#rkCsv').onclick=()=>this.exportCSV();
  },
  exportCSV(){
    if(this.isTrain()){
      const d=t=>t?new Date(t).toLocaleString('fr-FR'):'';
      const head=['Nom','Statut','Début','Fin','Durée','Distance (km)','Vitesse moyenne (km/h)','Allure moyenne (min/km)','Points GPS'];
      const lines=this.ranking().map(({st,i})=>[st.name,this.stLabel(st,i).replace(/^\S+\s/,''),d(st.startAt),d(st.finishAt),i.el!=null?fmtTime(i.el):'',(i.dist/1000).toFixed(2).replace('.',','),i.speed?(i.speed*3.6).toFixed(1).replace('.',','):'',i.speed?fmtTime(1e6/i.speed):'',i.n].map(x=>String(x).replace(/;/g,',')).join(';'));
      saveFile(slug('bilan_'+this.o.name)+'.csv','\ufeff'+[head.join(';'),...lines].join('\n'),'text/csv');return}
    const c=this.o.course,sc=c.mode==='score',ctrls=c.points.filter(p=>p.type!=='start');
    const head=['Rang','Nom','Statut','Temps','Balises',...(sc?['Points','Pénalité','Net']:['Manquants']),...ctrls.map(p=>p.type==='finish'?'Arrivée':'Balise '+shortLabel(c.points,c.points.indexOf(p)))];
    const lines=this.ranking().map(({st,i},k)=>{const vm={};(st.visited||[]).forEach(v=>vm[v.id]=v);
      return[st.status==='finished'?k+1:'',st.name,this.stLabel(st,i).replace(/^\S+\s/,''),i.el!=null?fmtTime(i.el):'',i.done+'/'+i.n,...(sc?[st.score||0,st.pen||0,st.net||0]:[i.missing]),...ctrls.map(p=>vm[p.id]?fmtTime(vm[p.id].el):'')].map(x=>String(x).replace(/;/g,',')).join(';')});
    saveFile(slug('resultats_'+this.o.name)+'.csv','﻿'+[head.join(';'),...lines].join('\n'),'text/csv');
  },
  async more(){
    const del=this.o.status==='deleted';
    const tr=this.isTrain();
    const v=await modal({title:(tr?'Séance : ':'Course : ')+this.o.name,body:`<p class="hint">Code ${fmtCode(this.o.code)} · ${this.statusLabel(this.o.status,this.o.kind)}</p>`,buttons:[{label:tr?'⬇ Bilan CSV (tableur)':'⬇ Résultats CSV (tableur)',value:'csv'},{label:'🗺 Traces GPX de tous',value:'gpx'},del?{label:'🗑 Supprimer de cet appareil (résultats et replay)',value:'local',danger:true}:{label:tr?'🧹 Effacer la séance du relais':'🧹 Effacer la course du relais',value:'purge',danger:true},{label:'Fermer',value:null,primary:true}]});
    if(v==='csv')this.exportCSV();
    if(v==='gpx')this.exportGPX();
    if(v==='local'){const ok=await modal({title:`Supprimer cette ${tr?'séance':'course'} de l'appareil ?`,body:'<p>Les résultats et le replay seront perdus. Exporte le CSV avant si besoin.</p>',buttons:[{label:'🗑 Supprimer',value:true,danger:true},{label:'Annuler',value:false}]});
      if(ok){store.del(this.dataKey());store.set(K.orgs,store.get(K.orgs,[]).filter(x=>x.code!==this.o.code));this.o=null;toast((tr?'Séance':'Course')+' supprimée de l\'appareil');show('home')}return}
    if(v==='purge'){
      const ok=await modal({title:`Effacer la ${tr?'séance':'course'} du relais ?`,body:`<p>Plus personne ne pourra la rejoindre et les données sont retirées du relais. Le bilan et le replay restent sur cet appareil.</p>`,buttons:[{label:'🧹 Effacer',value:true,danger:true},{label:'Annuler',value:false}]});
      if(!ok)return;const e=new Uint8Array(0);
      this.saveData();
      Object.keys(this.runners).forEach(pid=>{this.m.publish(this.base+'/p/'+pid,e,true);this.m.publish(this.base+'/t/'+pid,e,true)});this.m.publish(this.base+'/race',e,true);
      this.o.status='deleted';this.save();toast((tr?'Séance':'Course')+' effacée du relais : résultats et replay restent sur cet appareil');setTimeout(()=>show('home'),900);
    }
  }
};
$('#orgList').addEventListener('click',e=>{const b=e.target.closest('[data-pid]');if(b)Org.select(b.dataset.pid)});
$('#orgLaunch').onclick=()=>Org.launch();
$('#orgClose').onclick=()=>Org.close();
$('#orgQR').onclick=()=>Org.showQR();
$('#orgRank').onclick=()=>Org.showRanking();
$('#orgMore').onclick=()=>Org.more();
$('#orgFit').onclick=()=>{if(!Org.fitAll())toast('Personne à afficher pour l\'instant.',true)};

/* ---------------- Replay de la course ---------------- */
const Replay={on:false,T:0,t0:0,t1:0,playing:false,lay:null,data:[],hidden:new Set(),timer:null,
  open(){
    const o=Org.o;if(!o)return;
    const data=Object.values(Org.runners).map(st=>({st,tr:Org.fullTrack(st.pid),col:Org.color(st.pid)})).filter(d=>d.tr.length>1);
    data.forEach(d=>{let c=0;d.cum=d.tr.map((q,k)=>{if(k){const a=d.tr[k-1],s=dist({lat:a[0],lon:a[1]},{lat:q[0],lon:q[1]});if(s/Math.max(1,(q[2]-a[2])/1000)<20)c+=s}return c})});
    if(!data.length){toast('Pas encore de trajets à rejouer : les traces arrivent au fil de l\'activité.',true);return}
    let t0=Infinity,t1=0;data.forEach(d=>{t0=Math.min(t0,d.tr[0][2]);t1=Math.max(t1,d.tr[d.tr.length-1][2])});
    if(o.startAt&&o.startAt-30000>t0&&o.startAt<t1)t0=o.startAt-30000;
    Object.assign(this,{data,t0,t1,T:t0,on:true,playing:false});this.hidden=new Set();
    if(!this.lay)this.lay=L.layerGroup().addTo(Org.map);Org.runLay.clearLayers();
    $('#orgReplay').hidden=false;$('#orgLive').hidden=true;$('#orgbarLive').hidden=true;
    this.legend();this.draw();
    const b=L.latLngBounds([]);data.forEach(d=>d.tr.forEach(q=>b.extend([q[0],q[1]])));if(o.course)o.course.points.forEach(p=>b.extend([p.lat,p.lon]));
    if(b.isValid())Org.map.fitBounds(b,{padding:[30,30],maxZoom:18});
  },
  close(silent){if(!this.on)return;this.pause();this.on=false;if(this.lay)this.lay.clearLayers();$('#orgReplay').hidden=true;$('#orgLive').hidden=false;$('#orgbarLive').hidden=false;if(!silent)Org.render()},
  play(){if(this.T>=this.t1)this.T=this.t0;this.playing=true;$('#rpPlay').textContent='⏸';clearInterval(this.timer);
    this.timer=setInterval(()=>{this.T=Math.min(this.t1,this.T+100*this.speed());this.draw();if(this.T>=this.t1)this.pause()},100)},
  pause(){this.playing=false;clearInterval(this.timer);const b=$('#rpPlay');if(b)b.textContent='▶'},
  speed(){return parseFloat($('#rpSpeed').value)||30},
  at(tr,T){let lo=0,hi=tr.length-1;if(T<tr[0][2])return null;while(lo<hi){const mid=(lo+hi+1)>>1;if(tr[mid][2]<=T)lo=mid;else hi=mid-1}
    const a=tr[lo],b=tr[lo+1];if(!b||b[2]-a[2]>120000)return{i:lo,ll:[a[0],a[1]]};const k=(T-a[2])/(b[2]-a[2]);return{i:lo,ll:[a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k]}},
  draw(){
    if(!this.on)return;this.lay.clearLayers();const o=Org.o,T=this.T;
    this.data.forEach(d=>{
      const p=this.at(d.tr,T),c=document.getElementById('rpc-'+d.st.pid);
      if(c){if(o.course){const n=(d.st.visited||[]).filter(v=>{const q=Org.ptById(v.id);return q&&q.type==='control'&&d.st.startAt&&d.st.startAt+v.el<=T}).length;c.textContent=n+'/'+o.course.points.filter(q=>q.type==='control').length}
        else c.textContent=fmtDist(p?d.cum[p.i]+dist({lat:d.tr[p.i][0],lon:d.tr[p.i][1]},{lat:p.ll[0],lon:p.ll[1]}):0)}
      if(this.hidden.has(d.st.pid)||!p)return;
      const tr=d.tr.slice(0,p.i+1).map(q=>[q[0],q[1]]);tr.push(p.ll);
      if(tr.length>1)L.polyline(tr,{color:d.col,weight:4,opacity:.8,interactive:false}).addTo(this.lay);
      const ini=d.st.name.split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();
      L.marker(p.ll,{icon:L.divIcon({className:'rmk',html:`<span style="background:${d.col}">${esc(ini)}</span><em>${esc(d.st.name)}</em>`,iconSize:[34,34],iconAnchor:[17,17]}),interactive:false,zIndexOffset:1000}).addTo(this.lay);
    });
    const ref=o.startAt||this.t0,el=T-ref;
    $('#rpTime').textContent=`${el<0?(o.course?'avant le départ −':'−')+fmtTime(-el):'⏱ '+fmtTime(el)} · ${new Date(T).toLocaleTimeString('fr-FR')}`;
    $('#rpSlider').value=String(Math.round((T-this.t0)/Math.max(1,this.t1-this.t0)*1000));
  },
  legend(){
    const c=Org.o.course,n=c?c.points.filter(p=>p.type==='control').length:0;
    $('#rpLegend').innerHTML=this.data.map(d=>`<li><label class="chk"><input type="checkbox" data-rp="${d.st.pid}" checked><span class="dot" style="background:${d.col}"></span>${esc(d.st.name)}<span class="muted" id="rpc-${d.st.pid}">${c?'0/'+n:'0 m'}</span></label></li>`).join('');
  }
};
$('#orgReplayBtn').onclick=()=>Replay.open();
$('#rpPlay').onclick=()=>{if(Replay.playing)Replay.pause();else Replay.play()};
$('#rpExit').onclick=()=>Replay.close();
$('#rpSlider').addEventListener('input',e=>{Replay.T=Replay.t0+(Replay.t1-Replay.t0)*(+e.target.value/1000);Replay.draw()});
$('#rpLegend').addEventListener('change',e=>{const c=e.target.closest('[data-rp]');if(!c)return;if(c.checked)Replay.hidden.delete(c.dataset.rp);else Replay.hidden.add(c.dataset.rp);Replay.draw()});
