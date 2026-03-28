import{j as a}from"./index-CALPGt7E.js";const o=`
@keyframes skeleton-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}
`;let s=!1;function i(){if(s)return;const e=document.createElement("style");e.textContent=o,document.head.appendChild(e),s=!0}function u({width:e="100%",height:t=12,borderRadius:n="var(--radius-sm)",style:r}){return i(),a.jsx("div",{style:{width:e,height:t,borderRadius:n,background:"var(--bg-4)",animation:"skeleton-pulse 1.5s ease-in-out infinite",...r}})}function c({width:e="100%",height:t=60,style:n}){return a.jsx(u,{width:e,height:t,borderRadius:"var(--radius)",style:n})}export{c as S,u as a};
