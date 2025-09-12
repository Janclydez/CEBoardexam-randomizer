async function post(url, data){
const r = await fetch(url,{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
if (!r.ok) throw new Error(await r.text());
return r.json();
}


function parseJSON(id){ try{ return JSON.parse(document.getElementById(id).value); }catch{ return null; } }
function parseNodes(){ return document.getElementById('nodes').value.split(',').map(x=>+x.trim()).filter(x=>!isNaN(x)); }


function drawSeries(canvas, xs, ys, label){
const ctx = canvas.getContext('2d');
const w = canvas.width, h = canvas.height;
ctx.clearRect(0,0,w,h);
if (xs.length===0) return;
const xmin = Math.min(...xs), xmax = Math.max(...xs);
const ymin = Math.min(...ys), ymax = Math.max(...ys);
const pad = 30; const sx = (x)=> pad + (w-2*pad)*( (x-xmin)/(xmax-xmin||1) );
const sy = (y)=> h-pad - (h-2*pad)*( (y-ymin)/(ymax-ymin||1) );


// axes
ctx.beginPath(); ctx.moveTo(pad, sy(0)); ctx.lineTo(w-pad, sy(0)); ctx.stroke();
ctx.beginPath(); ctx.moveTo(sx(xmin), pad); ctx.lineTo(sx(xmin), h-pad); ctx.stroke();


// series
ctx.beginPath(); ctx.moveTo(sx(xs[0]), sy(ys[0]));
for(let i=1;i<xs.length;i++){ ctx.lineTo(sx(xs[i]), sy(ys[i])); }
ctx.stroke();


// ticks
ctx.fillStyle='#555'; ctx.font='12px system-ui';
ctx.fillText(`${label} min=${ymin.toFixed(3)} max=${ymax.toFixed(3)}`, pad, 16);
}


async function solve(){
const nodes = parseNodes();
const elements = parseJSON('elements');
const supports = parseJSON('supports');
const loads = parseJSON('loads');
if (!nodes || !elements || !supports || !loads) { alert('Bad JSON/inputs'); return; }
const data = await post('/api/beam/solve', { nodes, elements, supports, loads });
const s = data.samples;
drawSeries(document.getElementById('cvV'), s.x, s.V, 'V(x) kN');
drawSeries(document.getElementById('cvM'), s.x, s.M, 'M(x) kN·m');
drawSeries(document.getElementById('cvW'), s.x, s.v, 'v(x) m');
drawSeries(document.getElementById('cvT'), s.x, s.theta, 'θ(x) rad');


const reac = (data.reactions||[]).map(r=>`Node ${r.node} — ${r.dof} = ${r.value.toFixed(3)}`).join('<br>');
document.getElementById('reac').innerHTML = `<div class="help">Reactions</div>${reac}`;
}


document.getElementById('solve').addEventListener('click', solve);