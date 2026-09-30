function locate(){

 if(!navigator.geolocation){
  return;
 }

 followUser=true;

 if(watchId!==null)
  navigator.geolocation.clearWatch(watchId);

 let animationFrame=null;
 let currentLatLng=null;
 let targetLatLng=null;

 function animateMarker(){

  if(!marker || !currentLatLng || !targetLatLng){
   animationFrame=null;
   return;
  }

  const speed=0.12;

  currentLatLng.lat +=
   (targetLatLng.lat-currentLatLng.lat)*speed;

  currentLatLng.lng +=
   (targetLatLng.lng-currentLatLng.lng)*speed;

  marker.setLatLng(currentLatLng);

  if(
   Math.abs(targetLatLng.lat-currentLatLng.lat)<0.000001 &&
   Math.abs(targetLatLng.lng-currentLatLng.lng)<0.000001
  ){
   currentLatLng={
    lat:targetLatLng.lat,
    lng:targetLatLng.lng
   };

   marker.setLatLng(currentLatLng);
   animationFrame=null;
   return;
  }

  animationFrame=requestAnimationFrame(animateMarker);
 }


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

    currentLatLng={
     lat:ll[0],
     lng:ll[1]
    };

    targetLatLng={
     lat:ll[0],
     lng:ll[1]
    };

    map.on('dragstart',function(){
     followUser=false;
    });

   }else{

    targetLatLng={
     lat:ll[0],
     lng:ll[1]
    };

    if(animationFrame===null)
     animationFrame=requestAnimationFrame(animateMarker);
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