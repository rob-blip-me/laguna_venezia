const map=L.map("map").setView([45.43,12.34],12);

L.tileLayer(
 "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
 {maxZoom:19,attribution:"© OpenStreetMap contributors"}
).addTo(map);

/* =========================================================
   BATIMETRIA: NUMERI DELLE PROFONDITÀ
   Mostra i punti del bathymetry.json solo a zoom > 13.5.
   Sono usati i valori negativi del JSON, interpretati come
   profondità sotto il datum e visualizzati come valori positivi.
   ========================================================= */

const bathymetryLabelLayer=L.layerGroup().addTo(map);
let bathymetryPoints=[];

const bathymetryIcon=L.divIcon({
 className:"bathymetry-label",
 html:"",
 iconSize:[0,0],
 iconAnchor:[0,0]
});

fetch("bathymetry.json")
.then(r=>{
 if(!r.ok)throw new Error("HTTP "+r.status);
 return r.json();
})
.then(data=>{
 bathymetryPoints=data.features
  .filter(f=>{
   const d=Number(f.properties?.depth);
   return Number.isFinite(d) && d<0 && f.geometry?.type==="Point";
  })
  .map(f=>({
   lat:f.geometry.coordinates[1],
   lon:f.geometry.coordinates[0],
   depth:Math.abs(Number(f.properties.depth))
  }));

 updateBathymetryLabels();
})
.catch(e=>console.error("Errore caricamento bathymetry.json:",e));

function updateBathymetryLabels(){
 bathymetryLabelLayer.clearLayers();

 // Leaflet usa livelli interi: zoom > 13.5 equivale a zoom >= 14.
 if(map.getZoom()<=13.5 || bathymetryPoints.length===0)
  return;

 const bounds=map.getBounds().pad(0.05);

 bathymetryPoints.forEach(pt=>{
  if(!bounds.contains([pt.lat,pt.lon]))
   return;

  const label=pt.depth.toFixed(1);

  L.marker([pt.lat,pt.lon],{
   icon:L.divIcon({
    className:"bathymetry-label",
    html:label,
    iconSize:[0,0],
    iconAnchor:[0,0]
   }),
   interactive:false
  }).addTo(bathymetryLabelLayer);
 });
}


map.on("zoomend moveend",updateBathymetryLabels);

/* =========================================================
   LONG PRESS: COORDINATE DEL PUNTO TOCCATO/CLICCATO
   Versione robusta per Android/Chrome e desktop.
   Tenendo premuto per 3 secondi in un punto della mappa,
   mostra latitudine e longitudine.
   ========================================================= */

let longPressTimer=null;
let longPressStartLatLng=null;
let longPressStartX=0;
let longPressStartY=0;
let longPressActive=false;
let longPressTriggered=false;

const LONG_PRESS_TIME=2000;
const LONG_PRESS_MOVE_TOLERANCE=25;

function cancelLongPress(){
 if(longPressTimer!==null){
  clearTimeout(longPressTimer);
  longPressTimer=null;
 }
 longPressStartLatLng=null;
 longPressActive=false;
}

function getContainerPoint(e){
 const rect=map.getContainer().getBoundingClientRect();
 return L.point(e.clientX-rect.left,e.clientY-rect.top);
}

function startLongPress(e){
 // Considera solo il pulsante sinistro del mouse; per il touch
 // pointerType è "touch".
 if(e.pointerType!=='touch' && e.pointerType!=='pen' && e.button!==0)
  return;

 cancelLongPress();
 longPressTriggered=false;
 longPressActive=true;

 const p=getContainerPoint(e);
 longPressStartX=e.clientX;
 longPressStartY=e.clientY;
 longPressStartLatLng=map.containerPointToLatLng(p);

 longPressTimer=setTimeout(()=>{
  if(!longPressActive || !longPressStartLatLng)return;

  const lat=longPressStartLatLng.lat.toFixed(6);
  const lon=longPressStartLatLng.lng.toFixed(6);
  longPressTriggered=true;

  L.popup({closeButton:true,closeOnClick:false,autoClose:true})
   .setLatLng(longPressStartLatLng)
   .setContent(
    '<b>Coordinate</b><br>'+
    'Latitudine: '+lat+'<br>'+ 
    'Longitudine: '+lon
   )
   .openOn(map);

  longPressTimer=null;
 },LONG_PRESS_TIME);
}

function checkLongPressMove(e){
 if(!longPressActive || longPressTimer===null)return;

 const dx=e.clientX-longPressStartX;
 const dy=e.clientY-longPressStartY;

 if(Math.sqrt(dx*dx+dy*dy)>LONG_PRESS_MOVE_TOLERANCE)
  cancelLongPress();
}

function endLongPress(){
 cancelLongPress();
}

// Pointer Events sono più affidabili su Android Chrome rispetto
// alla combinazione Leaflet mousedown/touchstart.
const mapContainer=map.getContainer();
mapContainer.addEventListener('pointerdown',startLongPress,{passive:true});
mapContainer.addEventListener('pointermove',checkLongPressMove,{passive:true});
mapContainer.addEventListener('pointerup',endLongPress,{passive:true});
mapContainer.addEventListener('pointercancel',endLongPress,{passive:true});
mapContainer.addEventListener('pointerleave',endLongPress,{passive:true});
/* =========================================================
   BRICCOLE
   Legge briccole.json e usa solo gli elementi
   con seamark:type = "pile".

   Per non appesantire il telefono:
   - le briccole sono visualizzate solo da zoom 14;
   - vengono disegnate solo quelle nella finestra corrente;
   - viene usato il renderer Canvas di Leaflet.
   ========================================================= */

const briccoleLayer=L.layerGroup().addTo(map);
let briccolePoints=[];

const briccoleRenderer=L.canvas({padding:0.05});

fetch("briccole.json")
.then(r=>{
 if(!r.ok)throw new Error("HTTP "+r.status);
 return r.json();
})
.then(data=>{
 briccolePoints=(data.elements||[])
  .filter(el=>
   el.type==="node" &&
   Number.isFinite(Number(el.lat)) &&
   Number.isFinite(Number(el.lon)) &&
   el.tags?.["seamark:type"]==="pile"
  )
  .map(el=>({
   lat:Number(el.lat),
   lon:Number(el.lon)
  }));

 updateBriccole();
 console.log("Briccole caricate:",briccolePoints.length);
})
.catch(e=>console.error("Errore caricamento briccole.json:",e));

function updateBriccole(){
 briccoleLayer.clearLayers();

 // Come per la batimetria: visibili da zoom 14.
 if(map.getZoom()<=13.5 || briccolePoints.length===0)
  return;

 const bounds=map.getBounds().pad(0.05);

 briccolePoints.forEach(pt=>{
  if(!bounds.contains([pt.lat,pt.lon]))
   return;

  L.circleMarker([pt.lat,pt.lon],{
   renderer:briccoleRenderer,
   radius:2,
   weight:1,
   color:"#555",
   fillColor:"#666",
   fillOpacity:0.9,
   opacity:0.9,
   interactive:false
  }).addTo(briccoleLayer);
 });
}

map.on("zoomend moveend",updateBriccole);

//const gisUrl="https://arcgis-prd.comune.venezia.it/server/rest/services/URBANISTICA/VPRG_Laguna_e_Isole_Minori_WGS84/MapServer";

// Solo i layer GIS necessari: canali e limiti. Niente briccole o batimetria.
//const laguna=L.esri.dynamicMapLayer({
 //url:gisUrl,
 //opacity:0.75,
 //layers:[28,51]
//}).addTo(map);

const channelStyle={
 color:'#42a5f5',
 weight:1.5,
 opacity:0.5,
 fillColor:'#64b5f6',
 fillOpacity:0.25
};

const channelHighlight={
 color:'#64b5f6',
 weight:3,
 fillOpacity:0.1
};

const channelsLayer=L.geoJSON(null,{
 style:channelStyle,
 onEachFeature:(feature,layer)=>{
  const p=feature.properties||{};
  const speed=(p.speed===null||p.speed===undefined||p.speed==='')?'—':p.speed+' km/h';

  layer.bindPopup(
   '<b>'+esc(p.name||'Canale')+'</b><br>Velocità: '+
   esc(speed)+
   (p.use?'<br>Uso: '+esc(p.use):'')+
   (p.jurisdiction?'<br>Giurisdizione: '+esc(p.jurisdiction):'')
  );

  layer.on({
   mouseover:e=>e.target.setStyle(channelHighlight),
   mouseout:e=>channelsLayer.resetStyle(e.target)
  });
 }
}).addTo(map);

function esc(s){
 return String(s).replace(
  /[&<>\"]/g,
  c=>({
   '&':'&amp;',
   '<':'&lt;',
   '>':'&gt;',
   '\\':'&#92;',
   '"':'&quot;'
  }[c])
 );
}

fetch("channels.json")
.then(r=>{
 if(!r.ok)throw new Error("HTTP "+r.status);
 return r.json();
})
.then(y=>{
 channelsLayer.addData(y);
})
.catch(e=>{
 console.error("Errore caricamento channels.json:",e);
});


/* =========================================================
   OSTACOLI: CAVI SOSPESI
   Gli ostacoli sono sempre visibili da zoom 14.
   ========================================================= */


const obstaclesLayer=L.layerGroup().addTo(map);

const obstacleIcon = L.divIcon({
  className: "obstacle-icon",
  html: '<img src="att.png" alt="obstacle" style="width:80%; height:80%; display:block;" />',
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

// Ostacolo inserito direttamente nel codice: non dipende da obstacles.json.
const obstacles=[
 {name:"Attenzione: Cavo sospeso",
 lat:45.495303,
 lon:12.415752,
 description:"Possibile presenza di un cavo elettrico sospeso"
},
{name:"Attenzione: Bilancia da pesca",
 lat:45.526506,
 lon:12.428166,
 description:"Possibile presenza di bilance da pesca"
},
{name:"Attenzione: Bilancia da pesca",
 lat:45.508493,
 lon:12.378344,
 description:"Possibile presenza di bilance da pesca"
},
{name:"Attenzione",
 lat:45.305022,
 lon:12.184546,
 description:"Acque basse"
},
{name:"Attenzione",
 lat:45.313858,
 lon:12.176601,
 description:"Acque basse"
}, 
{name:"Attenzione",
 lat:45.328135,
 lon:12.188822,
 description:"Acque basse"
}
];

function updateObstacles(){
obstaclesLayer.clearLayers();
if(map.getZoom()<=13.5) {
  return;
}
obstacles.forEach(obstacle=>{
 const marker=L.marker(
  [obstacle.lat,obstacle.lon],
  {
   icon:obstacleIcon,
   zIndexOffset:10000,
   title:obstacle.name
  }
 ).addTo(obstaclesLayer);

 marker.bindPopup(
  '<b>'+esc(obstacle.name)+'</b>'+
  '<br>'+esc(obstacle.description)
 );
});

console.log("Ostacoli caricati:",obstacles.length);
}

map.on("zoomend",updateObstacles);
updateObstacles();


/* =========================================================
   PERCORSO LITORANEA
   Le indicazioni sono visibili da zoom 14.
   ========================================================= */


const litoraneaLayer=L.layerGroup().addTo(map);

const litoraneaIcon = L.divIcon({
  className: "litoranea-icon",
  html: '<img src="litoranea.png" alt="litoranea" style="width:100%; height:100%; display:block;" />',
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

// Ostacolo inserito direttamente nel codice
const percorso=[
 {name:"Percorso Litoranea",
lat:45.497564,
lon:12.579603,
 description:"Segnaposto"
},
{name:"Percorso Litoranea",
lat:45.511640,
lon:12.597885,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.536175,
lon:12.656250,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.592420,
lon:12.827740,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.592660,
lon:12.859325,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.613197,
lon:12.881813,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.622742,
lon:12.917261,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.640568,
lon:12.951508,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.637447,
lon:12.995710,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.653693,
lon:13.029206,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.664566,
lon:13.062177,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.681059,
lon:13.089094,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.695209,
lon:13.102312,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.521143,
lon:12.633076,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.534852,
lon:12.642946,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.536175,
lon:12.695131,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.538294,
lon:12.727575,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.550722,
lon:12.732360,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.563463,
lon:12.751737,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.571395,
lon:12.796712,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.589327,
lon:12.813921,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.593771,
lon:12.850528,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.629795,
lon:12.933054,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.637372,
lon:12.945714,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.642863,
lon:12.966914,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.673000,
lon:13.072250,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.629345,
lon:12.893679,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.621692,
lon:12.906189,
 description:"Segnaposto"
},
 {name:"Percorso Litoranea",
lat:45.601548,
lon:12.877092,
 description:"Segnaposto"
}
];

/* CHIUSE ================================================ 
========================================================== */

const chiuseIcon = L.divIcon({
  className: "chiuse-icon",
  html: '<img src="chiuse.png" alt="Chiusa" style="width:90%; height:90%; display:block;" />',
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

// Chiusa inserita direttamente nel codice
const chiuse=[
 {name:"Chiusa",
lat:45.492841,
lon:12.576642,
 description:"Conca di Cavallino - tel. +39 329 9720397"
},
{name:"Chiusa",
lat:45.535303,
lon:12.721739,
 description:"Conca di Cortelazzo - tel. +39 329 9720397"
},
 {name:"Chiusa",
lat:45.659805,
lon:13.060150,
 description:"Conca di Bevazzana - Bevazzana Destra (Veneta): Normalmente aperta. tel. +39 329 9720397"
},
 {name:"Chiusa",
lat:45.671470,
lon:13.068651,
 description:"Conca di Bevazzana - Bevazzana Sinistra (Friulana): tel. +39 349 1536346"
}
];

function updateLitoranea(){
litoraneaLayer.clearLayers();
if(map.getZoom()<=13) {
  return;
}
percorso.forEach(tappa=>{
 const marker=L.marker(
  [tappa.lat,tappa.lon],
  {
   icon:litoraneaIcon,
   zIndexOffset:10000,
   title:tappa.name
  }
 ).addTo(litoraneaLayer);

 marker.bindPopup(
  '<b>'+esc(tappa.name)+'</b>'+
  '<br>'+esc(tappa.description)
 );
});

console.log("Percorso caricato:",percorso.length);

chiuse.forEach(chiusa=>{
 const marker=L.marker(
  [chiusa.lat,chiusa.lon],
  {
   icon:chiuseIcon,
   zIndexOffset:10000,
   title:chiusa.name
  }
 ).addTo(litoraneaLayer);

 marker.bindPopup(
  '<b>'+esc(chiusa.name)+'</b>'+
  '<br>'+esc(chiusa.description)
 );
});

console.log("Chiuse caricate:",chiuse.length);

}

map.on("zoomend",updateLitoranea);
updateLitoranea();

/* =========================================================
   PUNTI DI INTERESSE
   ========================================================= */

const pointsOfInterest=[
 {name:"Associazione Vela al Terzo",lat:45.438493,lon:12.356660,description:"Sede AVT ai Bacini, Arsenale Nord"},
 {name:"Cason Montiron",lat:45.55355,lon:12.51,description:"Casone abbandonato Laguna Nord"},
 {name:"Casone Millecampi",lat:45.2964,lon:12.19017,description:"Casone Laguna Sud"},
 {name:"Isola Falconera",lat:45.488687,lon:12.543266,description:"Isola delle Litoranee AVT"},
 {name:"L'Isola che non c'\u00e8",lat:45.517806, lon:12.439361,description:"Casone costruito sopra ad una barca"}, 
 {name:"Isola Buel del Lovo",lat:45.492505, lon:12.376452,description:"Isola Laguna Nord"},
 {name:"Casone Valle Zappa",lat:45.328697,lon:12.187758,description:"Caratteristico Casone Laguna Sud"},
 {name:"Fisolo",lat:45.362849, lon:12.290609,description:"Isola Fisolo (nome locale dello Svasso, uccello lagunare), Laguna Sud"},
 {name:"Poveglia",lat:45.382275, lon:12.331252,description:"Isola di Poveglia, parco cittadino"},
 {name:"Ex Poveglia",lat:45.374818, lon:12.292627,description:"Isola Ex Poveglia, Laguna Sud"},
 {name:"Campana",lat:45.383976, lon:12.285618,description:"Isola Campana, Laguna Sud"},
 {name:"San Marco in Boccalama",lat:45.388789, lon:12.282075,description:"San Marco in Boccalama, isola sommersa, custodisce i relitti di una galea e di una rascona sommerse"},
{name:"Sant'Angelo della Polvere",lat:45.408729, lon:12.283761,description:"Sant'Angelo della Polvere, Laguna Sud"},
 {name:"Spiaggia della Boschettona",lat:45.258511, lon:12.189722,description:"Nota località naturale e luogo famoso per il kitesurf"},
{name:"Agr. La Barena",lat:45.503324, lon:12.538764,description:"Approdo dell'agriturismo La Barena"},
{name:"Agr. Le Saline",lat:45.491910, lon:12.480185,description:"Approdo dell'agriturismo Le Saline"},
{name:"Agr. La Valli",lat:45.332188, lon:12.318347,description:"Approdo dell'agriturismo Le Valli"}
];

const poiLayer=L.layerGroup().addTo(map);
let selectedPOIMarker=null;

pointsOfInterest.forEach((poi,index)=>{
 const button=document.createElement("button");
 button.className="poiItem";
 button.textContent=poi.name;
 button.onclick=()=>selectPOI(index);
 poiList.appendChild(button);
});

// Evita che Leaflet interpreti lo scorrimento della lista come
// trascinamento della mappa. In questo modo la lista resta
// scorribile anche con il dito su Android/Chrome.
const poiListElement=document.getElementById("poiList");
L.DomEvent.disableClickPropagation(poiListElement);
L.DomEvent.disableScrollPropagation(poiListElement);
poiListElement.addEventListener("touchstart",e=>e.stopPropagation(),{passive:true});
poiListElement.addEventListener("touchmove",e=>e.stopPropagation(),{passive:true});

function toggleMenu(){
 const menu=document.getElementById("poiMenu");
 menu.style.display=menu.style.display==="block"?"none":"block";
}

function resetPOI(){
 followUser=false;

 if(selectedPOIMarker){
  if(selectedPOIMarker.isPopupOpen())
   selectedPOIMarker.closePopup();

  poiLayer.removeLayer(selectedPOIMarker);
  selectedPOIMarker=null;
 }
 toggleMenu();
}

function selectPOI(value){

 followUser=false;

 if(value===""){
  if(selectedPOIMarker){
   poiLayer.removeLayer(selectedPOIMarker);
   selectedPOIMarker=null;
  }
  return;
 }

 const poi=pointsOfInterest[Number(value)];
 if(!poi)return;

 if(selectedPOIMarker)
  poiLayer.removeLayer(selectedPOIMarker);

 selectedPOIMarker=L.marker([poi.lat,poi.lon])
 .addTo(poiLayer);

 selectedPOIMarker.bindPopup(
  '<b>'+esc(poi.name)+'</b>'+ 
  (poi.description?'<br>'+esc(poi.description):'')
 ).openPopup();

 map.panTo([poi.lat,poi.lon]);
 document.getElementById("poiMenu").style.display="none";
}

let marker=null;
let accuracy=null;
let watchId=null;
let followUser=true;

function locate(){

 if(!navigator.geolocation){
  return;
 }

 followUser=true;

 if(watchId!==null)
  navigator.geolocation.clearWatch(watchId);

 watchId=navigator.geolocation.watchPosition(
  p=>{

   const ll=[
    p.coords.latitude,
    p.coords.longitude
   ];

   const a=p.coords.accuracy||0;

   if(followUser)
    map.panTo(ll);

   if(!marker){

    marker=L.circleMarker(ll,{
     radius:8,
     weight:3,
     fillOpacity:1
    }).addTo(map);

    map.on('dragstart',function(){
     followUser=false;
    });

   }else{
    marker.setLatLng(ll);
   }

   if(!accuracy){

    accuracy=L.circle(ll,{
     radius:a,
     weight:1,
     fillOpacity:.08
    }).addTo(map);

   }else{

    accuracy
    .setLatLng(ll)
    .setRadius(a);

   }

  },

  e=>{
   console.error("GPS:",e.message);
  },

  {
   enableHighAccuracy:true,
   timeout:15000,
   maximumAge:0
  }
 );
}
