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
 description:"Possibile presenza di una bilancia da pesca"
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
/* =========================================================
   PUNTI DI INTERESSE
   ========================================================= */

const pointsOfInterest=[
 {name:"Associazione Vela al Terzo",lat:45.438493,lon:12.356660,description:"Sede AVT ai Bacini, Arsenale Nord"},
 {name:"Cason Montiron",lat:45.55355,lon:12.51,description:"Casone abbandonato Laguna Nord"},
 {name:"Casone Millecampi",lat:45.2964,lon:12.19017,description:"Casone Laguna Sud"},
 {name:"Isola Falconera",lat:45.488687,lon:12.543266,description:"Isola delle Litoranee AVT"},
 {name:"L'Isola che non c'\u00e8",lat:45.517806, lon:12.439361,description:"Casone costruito sopra ad una barca"}, 
 {name:"Casone Valle Zappa",lat:45.328697,lon:12.187758,description:"Caratteristico Casone Laguna Sud"},
 {name:"Fisolo",lat:45.362849, lon:12.290609,description:"Isola Fisolo (nome locale dello Svasso, uccello lagunare), Laguna Sud"},
 {name:"Poveglia",lat:45.382275, lon:12.331252,description:"Isola di Poveglia, parco cittadino"},
 {name:"Ex Poveglia",lat:45.374818, lon:12.292627,description:"Isola Ex Poveglia, Laguna Sud"},
 {name:"Campana",lat:45.383976, lon:12.285618,description:"Isola Campana, Laguna Sud"},
 {name:"San Marco in Boccalama",lat:45.388789, lon:12.282075,description:"San Marco in Boccalama, isola sommersa, custodisce i relitti di una galea e di una rascona sommerse"},
{name:"Sant'Angelo della Polvere",lat:45.408729, lon:12.283761,description:"Sant'Angelo della Polvere, Laguna Sud"},
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
