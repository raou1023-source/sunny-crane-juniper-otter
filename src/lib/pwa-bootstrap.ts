/** Runs in <head>. Public Chrome tabs get one 192/512 manifest and a controlling SW. */
export const PWA_BOOTSTRAP = `"use strict";
(function(){
  function keepAppManifest(){
    var nodes=document.querySelectorAll('link[rel="manifest"]');
    var hasApp=false;
    for(var i=0;i<nodes.length;i++){
      var href=nodes[i].getAttribute("href")||"";
      if(href.indexOf("__grok")!==-1){
        nodes[i].parentNode&&nodes[i].parentNode.removeChild(nodes[i]);
      }else if(href.indexOf("manifest.json")!==-1||href.indexOf("manifest.webmanifest")!==-1){
        hasApp=true;
      }
    }
    var head=document.head;
    if(!hasApp&&head){
      var l=document.createElement("link");
      l.rel="manifest";
      l.href="/manifest.json";
      head.appendChild(l);
    }
  }
  keepAppManifest();
  try{
    new MutationObserver(keepAppManifest).observe(document.documentElement,{childList:true,subtree:true});
  }catch(e){}
  window.__pwaPrompt=window.__pwaPrompt||null;
  window.addEventListener("beforeinstallprompt",function(e){
    e.preventDefault();
    window.__pwaPrompt=e;
    window.dispatchEvent(new Event("pwa-ready"));
  });
  window.addEventListener("appinstalled",function(){ window.__pwaPrompt=null; });
  if(!window.isSecureContext)return;
  if(!("serviceWorker"in navigator))return;
  var h=location.hostname;
  if(h==="localhost"||h==="127.0.0.1")return;
  navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"}).catch(function(){});
})();
`;
