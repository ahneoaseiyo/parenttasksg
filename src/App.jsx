import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Tokens ────────────────────────────────────────────────────────────────────
const C = {
  bg:"#F7F9F6", white:"#FFFFFF", ink:"#243247", ink2:"#425466",
  muted:"#596779", border:"#DCE6DF", red:"#B42332", redBg:"#FFF1F2",
  amber:"#936006", amberBg:"#FFF8E7", green:"#256B57", greenBg:"#E8F3ED",
  blue:"#2456A6", blueBg:"#EDF4FF", teal:"#256B57", tealBg:"#E8F3ED",
  pill:{
    "Things to bring":["#EEF2FF","#4338CA"],
    "Consent form":["#FEF9C3","#854D0E"],
    "Payment":["#DCFCE7","#166534"],
    "Activity prep":["#FCE7F3","#9D174D"],
    "Reminder":["#F3F4F6","#374151"],
    "Broadcast":["#EDE9FE","#5B21B6"],
  }
};

const fd = {initial:{opacity:0,y:10},animate:{opacity:1,y:0},exit:{opacity:0,y:-6},transition:{duration:.2}};

// ── Seed data ─────────────────────────────────────────────────────────────────
const SEED = [
  {id:1,child:"Arielle",level:"K1",title:"Bring one clean cardboard box",source:"Construction activity",dueLabel:"Tomorrow",category:"Things to bring",status:"Not done",sharedWith:["Grandma"],priority:"High"},
  {id:2,child:"Arielle",level:"K1",title:"Submit Wildlings excursion consent form",source:"Excursion notice",dueLabel:"Sunday",category:"Consent form",status:"Not done",sharedWith:[],priority:"High"},
  {id:3,child:"Lucas",level:"N2",title:"Pack extra clothes for water play",source:"Weekly update",dueLabel:"Tomorrow",category:"Things to bring",status:"Done",sharedWith:["Helper"],priority:"Medium"},
  {id:4,child:"Arielle",level:"K1",title:"Pay $18 workshop fee",source:"Payment reminder",dueLabel:"20 May",category:"Payment",status:"Not done",sharedWith:[],priority:"Medium"},
  {id:5,child:"Lucas",level:"N2",title:"Prepare family photo for show-and-tell",source:"Show-and-tell notice",dueLabel:"21 May",category:"Activity prep",status:"Not done",sharedWith:["Daddy"],priority:"Low"},
];

// Consent form example pre-fill
const CONSENT_SAMPLE = `Dear Parents / 亲爱的家长 / Para Ibu Bapa,

We are organising a field trip to the Singapore Botanic Gardens on Friday, 30 May 2026.

Please sign and return this consent form by Wednesday, 28 May 2026.

- Departure: 9:00am, return by 12:30pm
- Please pack a light snack and water bottle
- Wear school T-shirt and covered shoes
- Fee: $5 (inclusive of transport)

Please make payment via ParentTask by 27 May.

Thank you / 谢谢 / Terima kasih
Ms Priya, K2 Sunshine Class`;

const SAMPLES = [
  { label:"Consent form 📋", lang:"EN", text: CONSENT_SAMPLE },
  { label:"普通话 🇨🇳", lang:"ZH", text:"亲爱的家长，请在本周五前为您的孩子带一个干净的纸板箱，用于我们的建筑主题活动。谢谢您的配合！—— 李老师" },
  { label:"Bahasa 🇲🇾", lang:"MS", text:"Ibu bapa yang dihormati, sila hantar borang kebenaran untuk lawatan sambil belajar ke Taman Botani pada hari Jumaat. Tarikh akhir: Rabu, 28 Mei. Terima kasih." },
  { label:"Tamil 🇮🇳", lang:"TA", text:"மதிப்பிற்குரிய பெற்றோர்களே, வெள்ளிக்கிழமை நடைபெறும் புலம்பெயர் சுற்றுலாவுக்கான சம்மத படிவத்தை புதன்கிழமை, 28 மே க்குள் சமர்ப்பிக்கவும். நன்றி." },
  { label:"Payment 💳", lang:"EN", text:"Reminder: Workshop fee of $12 per child is due by 25 May. Please pay via PayNow to UEN 201234567A. Indicate child's name as reference." },
];

const TEACHER_BROADCASTS = [
  {id:101,title:"Return signed consent form for Garden trip",dueLabel:"28 May",category:"Consent form",priority:"High",sentTo:18,done:11,pending:7},
  {id:102,title:"Bring recycled materials (boxes, bottles)",dueLabel:"Tomorrow",category:"Things to bring",priority:"High",sentTo:18,done:14,pending:4},
  {id:103,title:"Pay $5 excursion fee via PayNow",dueLabel:"27 May",category:"Payment",priority:"Medium",sentTo:18,done:9,pending:9},
];

const PARENT_THREADS = [
  {
    id:"tan-arielle",
    parent:"Mei Ling Tan",
    child:"Arielle",
    level:"K1",
    topic:"Consent form",
    unread:2,
    priority:"High",
    lastSeen:"8 min ago",
    status:"Needs reply",
    messages:[
      {from:"parent",text:"Hi Ms Priya, Arielle has a mild cough today. Can she still join the Botanic Gardens trip?",time:"9:12 AM"},
      {from:"teacher",text:"Thanks for letting me know. If she is fever-free and well enough for outdoor walking, she may join. Please pack her inhaler if needed.",time:"9:18 AM"},
      {from:"parent",text:"Noted, thank you. I will monitor tonight and update tomorrow morning.",time:"9:21 AM"},
    ],
  },
  {
    id:"ong-lucas",
    parent:"Daniel Ong",
    child:"Lucas",
    level:"N2",
    topic:"Things to bring",
    unread:0,
    priority:"Medium",
    lastSeen:"24 min ago",
    status:"Open",
    messages:[
      {from:"parent",text:"For water play, should Lucas bring slippers or covered shoes?",time:"Yesterday"},
      {from:"teacher",text:"Please pack slippers for the activity and covered shoes for arrival/dismissal.",time:"Yesterday"},
    ],
  },
  {
    id:"siti-hana",
    parent:"Siti Rahman",
    child:"Hana",
    level:"K2",
    topic:"Payment",
    unread:1,
    priority:"Medium",
    lastSeen:"1 hr ago",
    status:"Needs reply",
    messages:[
      {from:"parent",text:"I paid via PayNow but forgot to put Hana's name. Reference is 9821.",time:"10:03 AM"},
    ],
  },
];

const MESSAGE_TEMPLATES = [
  "Thanks for the update. I have noted this for your child.",
  "Please send a photo of the completed form when convenient.",
  "I will check with the centre office and update you by today.",
];

const AUDIT_EVENTS = [
  {time:"10:42 AM",actor:"Ms Priya",action:"Sent reply to Mei Ling Tan",type:"Message",risk:"Low"},
  {time:"10:31 AM",actor:"Ms Priya",action:"Created broadcast: consent form reminder",type:"Broadcast",risk:"Low"},
  {time:"9:58 AM",actor:"Centre Admin",action:"Exported consent status report",type:"Admin",risk:"Medium"},
  {time:"9:18 AM",actor:"Parent",action:"Submitted Botanic Gardens consent form",type:"Consent",risk:"Low"},
];

const COMPLIANCE_SETTINGS = [
  {label:"Data retention",value:"24 months",detail:"Configurable by centre policy"},
  {label:"Audit export",value:"Enabled",detail:"CSV export for centre admins"},
  {label:"AI approval",value:"Required",detail:"Teacher must approve extracted tasks"},
  {label:"Sensitive fields",value:"Masked",detail:"Payment and medical notes restricted by role"},
];

const PILOT_KPIS = [
  {label:"Parent response rate",value:"86%",target:"Target 80%"},
  {label:"Missed task reduction",value:"42%",target:"Target 30%"},
  {label:"Teacher admin saved",value:"6.5h",target:"Weekly per centre"},
  {label:"Unread messages",value:"3",target:"Action today"},
];

const CAREGIVERS = [
  {id:"grandma", name:"Grandma Lim", role:"Grandparent", emoji:"👵", phone:"+65 9111 2222", access:["Things to bring","Activity prep"]},
  {id:"helper",  name:"Auntie Sri",  role:"Helper",      emoji:"🧹", phone:"+65 9333 4444", access:["Things to bring"]},
  {id:"daddy",   name:"Daddy",       role:"Parent",      emoji:"👨", phone:"+65 9555 6666", access:["Things to bring","Consent form","Payment","Activity prep"]},
];

const GOV_METRICS = [
  {label:"Centres onboarded", value:"42", sub:"Pilot-ready cluster rollout"},
  {label:"Parent response rate", value:"86%", sub:"Within first 24 hours"},
  {label:"Admin time saved", value:"6.5h", sub:"Per centre each week"},
  {label:"Languages supported", value:"4", sub:"English, Chinese, Malay, Tamil"},
];

const TRUST_CONTROLS = [
  "PDPA-aligned consent, data minimisation, and purpose limitation",
  "Role-based access for parents, teachers, centre admins, and caregivers",
  "Audit trail for broadcasts, consent submissions, reminders, and edits",
  "Singapore-hosted deployment option with encryption in transit and at rest",
];

const PROCUREMENT_STEPS = [
  {phase:"Pilot", detail:"Run 8-12 weeks with selected preschools and after-school care centres."},
  {phase:"Measure", detail:"Track response rates, missed-task reduction, teacher admin time, and parent satisfaction."},
  {phase:"Integrate", detail:"Connect with existing school communication channels, SSO, and approved payment flows."},
  {phase:"Scale", detail:"Roll out by cluster with bilingual onboarding and centre-level dashboards."},
];

// ── Mini components ───────────────────────────────────────────────────────────
const Pill = ({cat}) => {
  const [bg,tx] = C.pill[cat]||C.pill.Reminder;
  return <span style={{background:bg,color:tx,fontSize:10,fontWeight:700,letterSpacing:".05em",padding:"2px 8px",borderRadius:999,textTransform:"uppercase",whiteSpace:"nowrap"}}>{cat}</span>;
};

const GovBadge = ({children}) => (
  <span style={{display:"inline-flex",alignItems:"center",gap:6,background:"#ECFDF5",color:"#047857",border:"1px solid #A7F3D0",borderRadius:999,padding:"5px 10px",fontSize:11,fontWeight:800,letterSpacing:".03em",textTransform:"uppercase"}}>
    {children}
  </span>
);

// ── Animated ring stat card ───────────────────────────────────────────────────
function RingStat({emoji,label,value,total,accent,active,onClick}){
  const pct = total>0?Math.round((value/total)*100):0;
  const r=18, circ=2*Math.PI*r;
  return (
    <button onClick={onClick} style={{background:active?C.ink:C.white,border:`2px solid ${active?C.ink:C.border}`,borderRadius:18,padding:"14px 16px",cursor:"pointer",textAlign:"left",fontFamily:"inherit",flex:1,minWidth:0,transition:"all .18s",display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
      <svg width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={r} fill="none" stroke={active?"rgba(255,255,255,.2)":"#F0F0F0"} strokeWidth="4"/>
        <circle cx="24" cy="24" r={r} fill="none" stroke={active?"#fff":accent} strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={circ*(1-pct/100)}
          strokeLinecap="round" transform="rotate(-90 24 24)" style={{transition:"stroke-dashoffset .6s ease"}}/>
        <text x="24" y="28" textAnchor="middle" fontSize="13" fontWeight="800" fill={active?"#fff":C.ink}>{value}</text>
      </svg>
      <div style={{fontSize:11,fontWeight:700,color:active?"rgba(255,255,255,.8)":C.muted,textAlign:"center",letterSpacing:".03em",textTransform:"uppercase",lineHeight:1.3}}>{label}</div>
    </button>
  );
}

// ── PROFILE SETUP ─────────────────────────────────────────────────────────────
function ProfileSetupScreen({onDone}){
  const [step,setStep]=useState(0);
  const [children,setChildren]=useState([{name:"",level:"",centre:"",emoji:"🧒"}]);
  const emojis=["🧒","👦","👧","🐯","🐰","🦁","🐸","🌟"];
  const levels=["Infant","Playgroup","N1","N2","K1","K2"];
  const cur=children[step]||{};
  const upd=(k,v)=>setChildren(prev=>prev.map((c,i)=>i===step?{...c,[k]:v}:c));
  const addChild=()=>{setChildren(prev=>[...prev,{name:"",level:"",centre:"",emoji:"🧒"}]);setStep(children.length);};
  const canNext=cur.name&&cur.level&&cur.centre;
  return(
    <motion.div {...fd} style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:480}}>
        {/* Progress bar */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:28}}>
          <button onClick={()=>setStep(Math.max(0,step-1))} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:20,color:C.muted,padding:4}}>←</button>
          <div style={{flex:1,height:4,background:C.border,borderRadius:999}}>
            <div style={{height:"100%",width:`${((step+1)/Math.max(children.length,1))*100}%`,background:C.ink,borderRadius:999,transition:"width .3s"}}/>
          </div>
          <span style={{fontSize:12,color:C.muted,fontWeight:600}}>Child {step+1} of {children.length}</span>
        </div>
        <div style={{background:C.white,borderRadius:20,border:`1px solid ${C.border}`,padding:28}}>
          <h2 style={{fontSize:22,fontWeight:800,margin:"0 0 4px",color:C.ink}}>Set up child profile</h2>
          <p style={{fontSize:13,color:C.muted,margin:"0 0 22px"}}>Tasks will be organised by child and class level.</p>
          {/* Emoji picker */}
          <div style={{marginBottom:18}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.ink2,marginBottom:8,letterSpacing:".04em",textTransform:"uppercase"}}>Avatar</label>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {emojis.map(e=>(
                <button key={e} onClick={()=>upd("emoji",e)} style={{width:42,height:42,borderRadius:12,border:`2px solid ${cur.emoji===e?C.ink:C.border}`,background:cur.emoji===e?"#F3F4F6":C.white,fontSize:20,cursor:"pointer",transition:"all .12s"}}>{e}</button>
              ))}
            </div>
          </div>
          {/* Preview */}
          {cur.name&&(
            <div style={{background:C.bg,borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,marginBottom:18,border:`1px solid ${C.border}`}}>
              <span style={{fontSize:26}}>{cur.emoji}</span>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:C.ink}}>{cur.name}</div>
                <div style={{fontSize:12,color:C.muted}}>{cur.level||"—"} · {cur.centre||"—"}</div>
              </div>
            </div>
          )}
          {/* Name */}
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.ink2,marginBottom:6,letterSpacing:".04em",textTransform:"uppercase"}}>Child name</label>
            <input value={cur.name||""} onChange={e=>upd("name",e.target.value)} placeholder="e.g. Arielle"
              style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:11,padding:"10px 13px",fontSize:14,outline:"none",boxSizing:"border-box",background:C.white,color:C.ink}}/>
          </div>
          {/* Level */}
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.ink2,marginBottom:8,letterSpacing:".04em",textTransform:"uppercase"}}>Class level</label>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {levels.map(l=>(
                <button key={l} onClick={()=>upd("level",l)} style={{padding:"8px 14px",borderRadius:10,border:`1px solid ${cur.level===l?C.ink:C.border}`,background:cur.level===l?C.ink:C.white,color:cur.level===l?"#fff":C.ink2,fontWeight:600,fontSize:13,cursor:"pointer",transition:"all .12s"}}>{l}</button>
              ))}
            </div>
          </div>
          {/* Centre */}
          <div style={{marginBottom:20}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.ink2,marginBottom:6,letterSpacing:".04em",textTransform:"uppercase"}}>Childcare centre</label>
            <input value={cur.centre||""} onChange={e=>upd("centre",e.target.value)} placeholder="e.g. My First Skool Tampines"
              style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:11,padding:"10px 13px",fontSize:14,outline:"none",boxSizing:"border-box",background:C.white,color:C.ink}}/>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={addChild} style={{flex:1,padding:"11px",borderRadius:12,border:`1px solid ${C.border}`,background:"transparent",color:C.ink2,fontWeight:700,fontSize:13,cursor:"pointer"}}>＋ Add child</button>
            <button onClick={onDone} disabled={!canNext} style={{flex:2,padding:"11px",borderRadius:12,border:"none",background:canNext?C.ink:"#D1D5DB",color:"#fff",fontWeight:800,fontSize:13,cursor:canNext?"pointer":"not-allowed"}}>
              Continue →
            </button>
          </div>
        </div>
        {/* Child chips */}
        {children.length>1&&(
          <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>
            {children.map((c,i)=>(
              <button key={i} onClick={()=>setStep(i)} style={{display:"flex",alignItems:"center",gap:6,background:i===step?C.ink:C.white,color:i===step?"#fff":C.ink2,border:`1px solid ${C.border}`,borderRadius:20,padding:"6px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                <span>{c.emoji||"🧒"}</span>{c.name||`Child ${i+1}`}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── CAREGIVER SHARING ─────────────────────────────────────────────────────────
function CaregiverScreen({tasks,setTasks,onBack}){
  const [selected,setSelected]=useState(null);
  const [sent,setSent]=useState({});
  const cg=CAREGIVERS.find(c=>c.id===selected);
  const pendingTasks=tasks.filter(t=>t.status!=="Done");

  function shareTask(cgId,taskId){
    const key=`${cgId}-${taskId}`;
    setSent(prev=>({...prev,[key]:true}));
    setTasks(prev=>prev.map(t=>{
      if(t.id!==taskId)return t;
      const cg=CAREGIVERS.find(c=>c.id===cgId);
      if(!t.sharedWith.includes(cg.name))return{...t,sharedWith:[...t.sharedWith,cg.name]};
      return t;
    }));
  }

  return(
    <motion.div {...fd} style={{minHeight:"100vh",background:C.bg,paddingBottom:80}}>
      {/* Header */}
      <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,padding:"0 16px",height:54,display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:10}}>
        <button onClick={onBack} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:20,color:C.ink,padding:4}}>←</button>
        <span style={{fontWeight:800,fontSize:16,color:C.ink}}>👥 Caregiver Sharing</span>
      </div>
      <div style={{maxWidth:640,margin:"0 auto",padding:"20px 16px"}}>
        <p style={{fontSize:13,color:C.muted,margin:"0 0 20px",lineHeight:1.6}}>
          Share only the tasks each caregiver needs. Grandparents and helpers won't see payment details.
        </p>
        {/* Caregiver cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:24}}>
          {CAREGIVERS.map(cg=>{
            const sharedCount=tasks.filter(t=>t.sharedWith.includes(cg.name)).length;
            const isSel=selected===cg.id;
            return(
              <button key={cg.id} onClick={()=>setSelected(isSel?null:cg.id)}
                style={{textAlign:"left",background:isSel?C.ink:C.white,border:`2px solid ${isSel?C.ink:C.border}`,borderRadius:16,padding:"16px",cursor:"pointer",transition:"all .15s"}}>
                <div style={{fontSize:28,marginBottom:8}}>{cg.emoji}</div>
                <div style={{fontWeight:700,fontSize:14,color:isSel?"#fff":C.ink,marginBottom:2}}>{cg.name}</div>
                <div style={{fontSize:11,color:isSel?"rgba(255,255,255,.5)":C.muted,marginBottom:10}}>{cg.role}</div>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{width:7,height:7,borderRadius:"50%",background:sharedCount>0?C.green:"#D1D5DB",display:"inline-block"}}/>
                  <span style={{fontSize:11,color:isSel?"rgba(255,255,255,.5)":C.muted,fontWeight:600}}>{sharedCount} shared</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail panel */}
        <AnimatePresence>
          {cg&&(
            <motion.div {...fd}>
              <div style={{background:C.white,borderRadius:18,border:`1px solid ${C.border}`,overflow:"hidden"}}>
                {/* Caregiver header */}
                <div style={{background:C.ink,padding:"18px 20px",display:"flex",alignItems:"center",gap:14}}>
                  <div style={{width:46,height:46,borderRadius:14,background:"rgba(255,255,255,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{cg.emoji}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:16,color:"#fff"}}>{cg.name}</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,.5)"}}>{cg.role} · {cg.phone}</div>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.4)",marginBottom:4,textTransform:"uppercase",letterSpacing:".05em"}}>Can see</div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {cg.access.map(a=>(
                        <span key={a} style={{fontSize:10,fontWeight:700,background:"rgba(255,255,255,.15)",color:"#fff",padding:"3px 8px",borderRadius:6,textTransform:"uppercase",letterSpacing:".03em"}}>{a}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Relevant tasks */}
                <div style={{padding:"18px 20px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:14}}>
                    Tasks for {cg.name.split(" ")[0]}
                  </div>
                  {pendingTasks.filter(t=>cg.access.includes(t.category)).length===0?(
                    <div style={{textAlign:"center",padding:"24px",color:C.muted,fontSize:13}}>No pending tasks in this caregiver's categories.</div>
                  ):(
                    pendingTasks.filter(t=>cg.access.includes(t.category)).map(task=>{
                      const isShared=task.sharedWith.includes(cg.name);
                      return(
                        <div key={task.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${C.border}`}}>
                          <div style={{flex:1,minWidth:0}}>
                            <Pill cat={task.category}/>
                            <div style={{fontSize:14,fontWeight:600,color:C.ink,margin:"6px 0 2px",lineHeight:1.4}}>{task.title}</div>
                            <div style={{fontSize:11,color:C.muted}}>{task.child} · {task.level} · Due {task.dueLabel}</div>
                          </div>
                          {isShared?(
                            <span style={{fontSize:12,color:C.green,fontWeight:700,whiteSpace:"nowrap"}}>✅ Shared</span>
                          ):(
                            <button onClick={()=>shareTask(cg.id,task.id)}
                              style={{border:`1px solid ${C.border}`,borderRadius:9,background:C.bg,cursor:"pointer",fontSize:12,color:C.ink2,fontWeight:600,padding:"7px 14px",whiteSpace:"nowrap"}}>
                              Share →
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Privacy note */}
                <div style={{background:C.bg,borderTop:`1px solid ${C.border}`,padding:"12px 20px",display:"flex",gap:8,alignItems:"flex-start"}}>
                  <span style={{fontSize:16}}>🔒</span>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>
                    <strong style={{color:C.ink2}}>{cg.name.split(" ")[0]} cannot see: </strong>
                    {["Things to bring","Consent form","Payment","Activity prep","Reminder"].filter(c=>!cg.access.includes(c)).join(", ")||"nothing — full access"}.
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!cg&&(
          <div style={{background:C.blueBg,border:`1px solid #BFDBFE`,borderRadius:13,padding:"13px 16px",fontSize:13,color:"#1E40AF"}}>
            👆 Tap a caregiver above to manage what they can see.
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginScreen({onParent,onTeacher,onGov,onAdmin}){
  const [tab,setTab]=useState("parent");
  const [email,setEmail]=useState("");
  const [pw,setPw]=useState("");
  return (
    <motion.div {...fd} style={{minHeight:"100vh",background:"#0F172A",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:1060,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:18,alignItems:"stretch"}}>
        <section style={{background:"#F8FAFC",border:"1px solid rgba(255,255,255,.12)",borderRadius:24,padding:28,display:"flex",flexDirection:"column",justifyContent:"space-between",minHeight:560}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:30}}>
              <div style={{width:42,height:42,borderRadius:12,background:"#EF4444",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🇸🇬</div>
              <div>
                <div style={{fontWeight:950,fontSize:18,color:"#0F172A",lineHeight:1}}>ParentTask SG</div>
                <div style={{fontSize:11,color:"#64748B",fontWeight:800,marginTop:3}}>Preschool task coordination</div>
              </div>
            </div>
            <h1 style={{fontSize:38,lineHeight:1.04,letterSpacing:"-.02em",fontWeight:950,color:"#0F172A",margin:"0 0 14px"}}>One trusted inbox for school tasks.</h1>
            <p style={{fontSize:15,color:"#475569",lineHeight:1.7,margin:"0 0 20px",maxWidth:460}}>
              Parents see clear actions. Teachers get replies and audit trails. Centres keep communication governed.
            </p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {["English","中文","Bahasa Melayu","தமிழ்"].map(l=>(
                <span key={l} style={{fontSize:11,color:"#334155",background:"#fff",border:"1px solid #E2E8F0",borderRadius:999,padding:"5px 10px",fontWeight:800}}>{l}</span>
              ))}
            </div>
          </div>

          <div style={{background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:18,padding:16,marginTop:26}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:950,color:"#0F172A"}}>Today at K2 Sunshine</div>
              <span style={{fontSize:11,color:"#B91C1C",fontWeight:900}}>3 actions</span>
            </div>
            {[
              ["Consent form","Garden trip form","28 May","#FEF9C3","#854D0E"],
              ["Payment","Pay $5 excursion fee","27 May","#DCFCE7","#166534"],
              ["Things to bring","Pack snack and bottle","Friday","#EEF2FF","#4338CA"],
            ].map(([cat,title,due,bg,tx])=>(
              <div key={title} style={{display:"flex",gap:10,alignItems:"center",padding:"10px 0",borderTop:"1px solid #F1F5F9"}}>
                <span style={{width:10,height:10,borderRadius:"50%",background:tx,flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:900,color:"#0F172A"}}>{title}</div>
                  <div style={{fontSize:11,color:"#64748B",marginTop:2}}>{cat} · Due {due}</div>
                </div>
                <span style={{fontSize:10,fontWeight:900,color:tx,background:bg,borderRadius:999,padding:"4px 7px"}}>NEW</span>
              </div>
            ))}
          </div>
        </section>

        <section style={{background:"#111827",border:"1px solid rgba(255,255,255,.12)",borderRadius:24,padding:28,boxShadow:"0 24px 80px rgba(0,0,0,.28)",display:"flex",flexDirection:"column",justifyContent:"center"}}>
          <div style={{marginBottom:22}}>
            <div style={{fontSize:12,color:"rgba(255,255,255,.45)",fontWeight:900,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Secure access</div>
            <h2 style={{fontSize:26,fontWeight:950,color:"#fff",margin:"0 0 6px",letterSpacing:"-.01em"}}>{tab==="teacher"?"Teacher portal":"Parent login"}</h2>
            <p style={{fontSize:13,color:"rgba(255,255,255,.5)",lineHeight:1.6,margin:0}}>{tab==="teacher"?"Send broadcasts, reply to parents, and review class status.":"View tasks, sign forms, share with caregivers, and reply to school."}</p>
          </div>

          <div style={{display:"flex",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.08)",borderRadius:14,padding:4,marginBottom:18,gap:4}}>
            {[{id:"parent",label:"Parent"},{id:"teacher",label:"Teacher"}].map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"10px 8px",borderRadius:10,border:"none",fontFamily:"inherit",fontWeight:900,fontSize:13,cursor:"pointer",background:tab===t.id?"#fff":"transparent",color:tab===t.id?C.ink:"rgba(255,255,255,.55)",transition:"all .15s"}}>
                {t.id==="parent"?"👨‍👩‍👧 ":"👩‍🏫 "}{t.label}
              </button>
            ))}
          </div>

          {tab==="parent"&&(
            <>
              <button onClick={onParent} style={{width:"100%",height:48,borderRadius:13,border:"none",background:"#E60012",color:"#fff",fontWeight:950,fontSize:15,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:12,boxShadow:"0 10px 28px rgba(230,0,18,.22)"}}>
                <span style={{width:24,height:24,borderRadius:7,background:"#fff",color:"#E60012",display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:950,fontSize:13}}>sp</span>
                Continue with Singpass
              </button>
              <div style={{display:"flex",alignItems:"center",gap:10,margin:"8px 0 16px"}}>
                <div style={{height:1,background:"rgba(255,255,255,.1)",flex:1}}/>
                <span style={{fontSize:11,color:"rgba(255,255,255,.32)",fontWeight:800}}>DEMO SIGNPASS VISUAL</span>
                <div style={{height:1,background:"rgba(255,255,255,.1)",flex:1}}/>
              </div>
            </>
          )}

          <div style={{marginBottom:14}}>
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email / 电邮 / E-mel" type="email"
              style={{width:"100%",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.14)",borderRadius:12,padding:"12px 14px",fontSize:14,color:"#fff",outline:"none",fontFamily:"inherit",boxSizing:"border-box",marginBottom:10}}/>
            <input value={pw} onChange={e=>setPw(e.target.value)} placeholder="Password / 密码 / Kata laluan" type="password"
              style={{width:"100%",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.14)",borderRadius:12,padding:"12px 14px",fontSize:14,color:"#fff",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>

          <button onClick={tab==="teacher"?onTeacher:onParent}
            style={{width:"100%",padding:"13px",borderRadius:13,border:"none",background:"#fff",color:C.ink,fontWeight:900,fontSize:15,cursor:"pointer",fontFamily:"inherit",transition:"opacity .15s"}}>
            {tab==="teacher"?"Enter Teacher Portal →":"Sign in with email →"}
          </button>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:12}}>
            <button onClick={onGov} style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:11,color:"rgba(255,255,255,.74)",fontWeight:800,fontSize:12,padding:"9px 10px",cursor:"pointer",fontFamily:"inherit"}}>
              Gov brief
            </button>
            <button onClick={onAdmin} style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:11,color:"rgba(255,255,255,.74)",fontWeight:800,fontSize:12,padding:"9px 10px",cursor:"pointer",fontFamily:"inherit"}}>
              Admin console
            </button>
          </div>

          <div style={{textAlign:"center",marginTop:16}}>
            <button onClick={tab==="teacher"?onTeacher:onParent} style={{background:"transparent",border:"none",fontSize:12,color:"rgba(255,255,255,.38)",cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>
              Skip — view demo
            </button>
          </div>
        </section>
      </div>
    </motion.div>
  );
}

// ── TEACHER PORTAL ────────────────────────────────────────────────────────────
function TeacherScreen({onBack}){
  const [broadcasts,setBroadcasts]=useState(TEACHER_BROADCASTS);
  const [mode,setMode]=useState("broadcasts");
  const [composing,setComposing]=useState(false);
  const [draft,setDraft]=useState({title:"",category:"Consent form",dueLabel:"",note:""});
  const [sent,setSent]=useState(false);
  const [expanding,setExpanding]=useState(null);
  const [threads,setThreads]=useState(PARENT_THREADS);
  const [activeThreadId,setActiveThreadId]=useState(PARENT_THREADS[0].id);
  const [reply,setReply]=useState("");
  const [messageSent,setMessageSent]=useState(false);

  const activeThread=threads.find(t=>t.id===activeThreadId)||threads[0];
  const unreadTotal=threads.reduce((sum,t)=>sum+t.unread,0);
  const needsReply=threads.filter(t=>t.status==="Needs reply").length;

  function sendBroadcast(){
    if(!draft.title||!draft.dueLabel)return;
    setBroadcasts(prev=>[{id:Date.now(),title:draft.title,dueLabel:draft.dueLabel,category:draft.category,priority:"High",sentTo:18,done:0,pending:18},...prev]);
    setDraft({title:"",category:"Consent form",dueLabel:"",note:""});
    setComposing(false);
    setSent(true);
    setTimeout(()=>setSent(false),3000);
  }

  function sendReply(){
    if(!reply.trim()||!activeThread)return;
    const outgoing={from:"teacher",text:reply.trim(),time:"Just now"};
    setThreads(prev=>prev.map(t=>t.id===activeThread.id?{...t,unread:0,status:"Open",lastSeen:"Just now",messages:[...t.messages,outgoing]}:t));
    setReply("");
    setMessageSent(true);
    setTimeout(()=>setMessageSent(false),2200);
  }

  return (
    <motion.div {...fd} style={{minHeight:"100vh",background:"#0D1117",color:"#fff",fontFamily:"DM Sans,Helvetica Neue,sans-serif"}}>
      {/* Header */}
      <div style={{background:"#161B22",borderBottom:"1px solid #30363D",padding:"0 20px",height:56,display:"flex",alignItems:"center",gap:16}}>
        <button onClick={onBack} style={{background:"transparent",border:"none",color:"rgba(255,255,255,.5)",cursor:"pointer",fontSize:13,fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}>← Back</button>
        <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>👩‍🏫 Teacher Portal</div>
        <div style={{marginLeft:"auto",fontSize:12,color:"rgba(255,255,255,.4)"}}>K2 Sunshine · Ms Priya</div>
      </div>

      <div style={{maxWidth:700,margin:"0 auto",padding:"24px 20px"}}>
        <div style={{display:"flex",background:"#161B22",border:"1px solid #30363D",borderRadius:14,padding:4,marginBottom:20,gap:4}}>
          {[
            {id:"broadcasts",label:"📢 Broadcasts",badge:broadcasts.length},
            {id:"messages",label:"💬 Messages",badge:unreadTotal},
          ].map(t=>(
            <button key={t.id} onClick={()=>setMode(t.id)}
              style={{flex:1,border:"none",borderRadius:10,padding:"10px 12px",background:mode===t.id?"#fff":"transparent",color:mode===t.id?C.ink:"rgba(255,255,255,.55)",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              {t.label}
              <span style={{fontSize:10,borderRadius:999,padding:"2px 7px",background:mode===t.id?"#E5E7EB":"rgba(255,255,255,.1)",color:mode===t.id?C.ink:"rgba(255,255,255,.7)"}}>{t.badge}</span>
            </button>
          ))}
        </div>

        {mode==="broadcasts" ? (
        <>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,flexWrap:"wrap",gap:12}}>
          <div>
            <h1 style={{fontSize:22,fontWeight:800,margin:"0 0 4px",color:"#fff"}}>Broadcast tasks to parents</h1>
            <p style={{fontSize:13,color:"rgba(255,255,255,.4)",margin:0}}>Tasks appear on every parent's checklist. Track who's done it.</p>
          </div>
          <button onClick={()=>setComposing(true)} style={{background:"#238636",border:"1px solid #2EA043",borderRadius:12,color:"#fff",fontWeight:700,fontSize:13,padding:"10px 18px",cursor:"pointer",fontFamily:"inherit"}}>
            ＋ New broadcast
          </button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:18}}>
          {[
            ["Audit log","Every broadcast and consent action is timestamped"],
            ["Approval flow","AI suggestions require teacher confirmation"],
            ["PDPA mode","Parents see only child-relevant task data"],
          ].map(([title,body])=>(
            <div key={title} style={{background:"#0D1117",border:"1px solid #30363D",borderRadius:12,padding:"12px 14px"}}>
              <div style={{fontSize:12,fontWeight:800,color:"#fff",marginBottom:4}}>{title}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.42)",lineHeight:1.45}}>{body}</div>
            </div>
          ))}
        </div>

        {/* Sent confirmation */}
        <AnimatePresence>
          {sent && (
            <motion.div {...fd} style={{background:"#1A3A1A",border:"1px solid #2EA043",borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:13,color:"#56D364",display:"flex",alignItems:"center",gap:8}}>
              ✅ Broadcast sent to 18 parents!
            </motion.div>
          )}
        </AnimatePresence>

        {/* Compose modal */}
        <AnimatePresence>
          {composing && (
            <motion.div {...fd} style={{background:"#161B22",border:"1px solid #30363D",borderRadius:16,padding:22,marginBottom:20}}>
              <div style={{fontWeight:700,fontSize:15,color:"#fff",marginBottom:16}}>📢 New broadcast task</div>

              <div style={{marginBottom:12}}>
                <label style={{display:"block",fontSize:11,color:"rgba(255,255,255,.4)",fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:".05em"}}>Task title</label>
                <input value={draft.title} onChange={e=>setDraft(p=>({...p,title:e.target.value}))}
                  placeholder="e.g. Return signed consent form by Friday"
                  style={{width:"100%",background:"#0D1117",border:"1px solid #30363D",borderRadius:10,padding:"10px 12px",color:"#fff",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                <div>
                  <label style={{display:"block",fontSize:11,color:"rgba(255,255,255,.4)",fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:".05em"}}>Category</label>
                  <select value={draft.category} onChange={e=>setDraft(p=>({...p,category:e.target.value}))}
                    style={{width:"100%",background:"#0D1117",border:"1px solid #30363D",borderRadius:10,padding:"10px 12px",color:"#fff",fontSize:14,fontFamily:"inherit",outline:"none"}}>
                    {["Consent form","Things to bring","Payment","Activity prep","Reminder"].map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{display:"block",fontSize:11,color:"rgba(255,255,255,.4)",fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:".05em"}}>Due date</label>
                  <input value={draft.dueLabel} onChange={e=>setDraft(p=>({...p,dueLabel:e.target.value}))}
                    placeholder="e.g. Friday, 30 May"
                    style={{width:"100%",background:"#0D1117",border:"1px solid #30363D",borderRadius:10,padding:"10px 12px",color:"#fff",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                </div>
              </div>

              <div style={{marginBottom:16}}>
                <label style={{display:"block",fontSize:11,color:"rgba(255,255,255,.4)",fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:".05em"}}>Note to parents (optional)</label>
                <textarea value={draft.note} onChange={e=>setDraft(p=>({...p,note:e.target.value}))} rows={2}
                  placeholder="Any extra instructions…"
                  style={{width:"100%",background:"#0D1117",border:"1px solid #30363D",borderRadius:10,padding:"10px 12px",color:"#fff",fontSize:13,fontFamily:"inherit",outline:"none",resize:"none",boxSizing:"border-box"}}/>
              </div>

              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setComposing(false)} style={{flex:1,padding:"10px",borderRadius:10,border:"1px solid #30363D",background:"transparent",color:"rgba(255,255,255,.6)",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                <button onClick={sendBroadcast} disabled={!draft.title||!draft.dueLabel}
                  style={{flex:2,padding:"10px",borderRadius:10,border:"none",background:draft.title&&draft.dueLabel?"#238636":"#30363D",color:"#fff",fontWeight:700,fontSize:13,cursor:draft.title&&draft.dueLabel?"pointer":"not-allowed",fontFamily:"inherit"}}>
                  📢 Send to all 18 parents
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Broadcast list */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {broadcasts.map(b=>{
            const pct=Math.round((b.done/b.sentTo)*100);
            const isOpen=expanding===b.id;
            return (
              <div key={b.id} style={{background:"#161B22",border:"1px solid #30363D",borderRadius:16,overflow:"hidden"}}>
                <button onClick={()=>setExpanding(isOpen?null:b.id)} style={{width:"100%",background:"transparent",border:"none",cursor:"pointer",padding:"16px 18px",textAlign:"left",fontFamily:"inherit"}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                    <div style={{flex:1,minWidth:0}}>
                      <Pill cat={b.category}/>
                      <div style={{fontSize:14,fontWeight:700,color:"#fff",margin:"8px 0 4px",lineHeight:1.4}}>{b.title}</div>
                      <div style={{fontSize:12,color:"rgba(255,255,255,.4)"}}>Due {b.dueLabel} · Sent to {b.sentTo} parents</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:22,fontWeight:900,color:"#fff"}}>{b.done}<span style={{fontSize:12,color:"rgba(255,255,255,.3)"}}>/{b.sentTo}</span></div>
                      <div style={{fontSize:11,color:b.pending===0?"#56D364":"#F59E0B",fontWeight:700}}>{b.pending===0?"All done ✅":`${b.pending} pending`}</div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{height:4,background:"#30363D",borderRadius:999,marginTop:12,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:pct===100?"#56D364":"#58A6FF",borderRadius:999,transition:"width .5s"}}/>
                  </div>
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} style={{overflow:"hidden"}}>
                      <div style={{borderTop:"1px solid #30363D",padding:"14px 18px"}}>
                        <div style={{fontSize:12,color:"rgba(255,255,255,.4)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:10}}>Response breakdown</div>
                        <div style={{display:"flex",gap:24}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"#56D364"}}><span style={{width:8,height:8,borderRadius:"50%",background:"#56D364",display:"inline-block"}}/>Done: {b.done}</div>
                          <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"#F59E0B"}}><span style={{width:8,height:8,borderRadius:"50%",background:"#F59E0B",display:"inline-block"}}/>Pending: {b.pending}</div>
                        </div>
                        <button style={{marginTop:12,padding:"8px 14px",borderRadius:9,border:"1px solid #30363D",background:"transparent",color:"rgba(255,255,255,.5)",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
                          📨 Send reminder to {b.pending} parents
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
        </>
        ) : (
        <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:12}}>
            <div>
              <h1 style={{fontSize:22,fontWeight:800,margin:"0 0 4px",color:"#fff"}}>Message parents</h1>
              <p style={{fontSize:13,color:"rgba(255,255,255,.4)",margin:0}}>Handle parent questions without losing the audit trail.</p>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <span style={{background:"#7F1D1D",color:"#FCA5A5",border:"1px solid #991B1B",borderRadius:999,padding:"7px 11px",fontSize:12,fontWeight:800}}>{needsReply} need reply</span>
              <span style={{background:"#111827",color:"#93C5FD",border:"1px solid #1D4ED8",borderRadius:999,padding:"7px 11px",fontSize:12,fontWeight:800}}>{unreadTotal} unread</span>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14}}>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {threads.map(t=>{
                const selected=t.id===activeThread?.id;
                const urgent=t.priority==="High";
                return (
                  <button key={t.id} onClick={()=>{setActiveThreadId(t.id);setThreads(prev=>prev.map(x=>x.id===t.id?{...x,unread:0}:x));}}
                    style={{textAlign:"left",background:selected?"#fff":"#161B22",border:`1px solid ${selected?"#fff":"#30363D"}`,borderRadius:14,padding:"13px 14px",cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
                    <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center",marginBottom:6}}>
                      <div style={{fontWeight:900,fontSize:13,color:selected?C.ink:"#fff"}}>{t.parent}</div>
                      {t.unread>0&&<span style={{background:"#EF4444",color:"#fff",borderRadius:999,minWidth:20,height:20,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900}}>{t.unread}</span>}
                    </div>
                    <div style={{fontSize:12,color:selected?C.ink2:"rgba(255,255,255,.52)",marginBottom:6}}>{t.child} · {t.level} · {t.topic}</div>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{fontSize:10,fontWeight:800,borderRadius:999,padding:"3px 7px",background:urgent?"#7F1D1D":"#312E81",color:urgent?"#FCA5A5":"#C4B5FD"}}>{t.priority}</span>
                      <span style={{fontSize:10,color:selected?C.muted:"rgba(255,255,255,.38)"}}>{t.lastSeen}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={{background:"#161B22",border:"1px solid #30363D",borderRadius:16,overflow:"hidden",minHeight:460,display:"flex",flexDirection:"column"}}>
              <div style={{padding:"16px 18px",borderBottom:"1px solid #30363D",display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:42,height:42,borderRadius:13,background:"#0D1117",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>👪</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:900,fontSize:15,color:"#fff"}}>{activeThread.parent}</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,.45)"}}>{activeThread.child} · {activeThread.level} · {activeThread.topic}</div>
                </div>
                <span style={{fontSize:11,fontWeight:900,borderRadius:999,padding:"5px 9px",background:activeThread.status==="Needs reply"?"#7F1D1D":"#12351F",color:activeThread.status==="Needs reply"?"#FCA5A5":"#86EFAC"}}>{activeThread.status}</span>
              </div>

              <div style={{padding:16,display:"flex",flexDirection:"column",gap:10,flex:1}}>
                {activeThread.messages.map((m,i)=>{
                  const mine=m.from==="teacher";
                  return (
                    <div key={i} style={{alignSelf:mine?"flex-end":"flex-start",maxWidth:"82%"}}>
                      <div style={{background:mine?"#238636":"#0D1117",border:`1px solid ${mine?"#2EA043":"#30363D"}`,borderRadius:14,borderBottomRightRadius:mine?4:14,borderBottomLeftRadius:mine?14:4,padding:"10px 12px",fontSize:13,lineHeight:1.55,color:"#fff"}}>
                        {m.text}
                      </div>
                      <div style={{fontSize:10,color:"rgba(255,255,255,.32)",marginTop:4,textAlign:mine?"right":"left"}}>{mine?"Ms Priya":"Parent"} · {m.time}</div>
                    </div>
                  );
                })}
              </div>

              <AnimatePresence>
                {messageSent&&(
                  <motion.div {...fd} style={{margin:"0 16px 10px",background:"#1A3A1A",border:"1px solid #2EA043",borderRadius:10,padding:"9px 12px",fontSize:12,color:"#56D364"}}>
                    ✅ Reply sent and logged.
                  </motion.div>
                )}
              </AnimatePresence>

              <div style={{borderTop:"1px solid #30363D",padding:14,background:"#0D1117"}}>
                <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:10}}>
                  {MESSAGE_TEMPLATES.map(t=>(
                    <button key={t} onClick={()=>setReply(t)} style={{border:"1px solid #30363D",background:"#161B22",color:"rgba(255,255,255,.62)",borderRadius:999,padding:"6px 9px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                      {t.length>34?`${t.slice(0,34)}…`:t}
                    </button>
                  ))}
                </div>
                <textarea value={reply} onChange={e=>setReply(e.target.value)} rows={3}
                  placeholder="Type a reply to the parent…"
                  style={{width:"100%",background:"#161B22",border:"1px solid #30363D",borderRadius:12,padding:"11px 12px",color:"#fff",fontSize:13,fontFamily:"inherit",outline:"none",resize:"none",boxSizing:"border-box",marginBottom:10}}/>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.36)",lineHeight:1.4,flex:1}}>Messages are visible to centre admins and retained for audit.</div>
                  <button onClick={sendReply} disabled={!reply.trim()} style={{border:"none",borderRadius:11,background:reply.trim()?"#238636":"#30363D",color:"#fff",fontWeight:900,fontSize:13,padding:"10px 16px",cursor:reply.trim()?"pointer":"not-allowed",fontFamily:"inherit"}}>
                    Send →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
        )}
      </div>
    </motion.div>
  );
}

// ── GOVERNMENT BUYER BRIEF ───────────────────────────────────────────────────
function GovReadinessScreen({onBack,onDemo}){
  return (
    <motion.div {...fd} style={{minHeight:"100vh",background:"#F8FAFC",color:"#0F172A",fontFamily:"DM Sans,Helvetica Neue,sans-serif",paddingBottom:48}}>
      <div style={{background:"#FFFFFF",borderBottom:"1px solid #E2E8F0",padding:"0 20px",height:58,display:"flex",alignItems:"center",gap:14,position:"sticky",top:0,zIndex:20}}>
        <button onClick={onBack} style={{background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:700}}>← Back</button>
        <div style={{fontWeight:900,fontSize:15,flex:1}}>ParentTask SG · Government Brief</div>
        <GovBadge>Preschool operations</GovBadge>
      </div>

      <div style={{maxWidth:980,margin:"0 auto",padding:"30px 20px"}}>
        <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:22,alignItems:"stretch",marginBottom:22}}>
          <div style={{background:"#0F172A",borderRadius:18,padding:"28px",color:"#fff",display:"flex",flexDirection:"column",justifyContent:"space-between",minHeight:310}}>
            <div>
              <GovBadge>For ECDA / MSF pilots</GovBadge>
              <h1 style={{fontSize:34,lineHeight:1.08,letterSpacing:"-.02em",margin:"18px 0 12px",fontWeight:950}}>
                Reduce missed parent tasks across Singapore preschools.
              </h1>
              <p style={{fontSize:15,lineHeight:1.7,color:"rgba(255,255,255,.72)",margin:"0 0 20px",maxWidth:620}}>
                ParentTask SG turns school messages into trackable actions, consent forms, payment reminders, and caregiver handoffs, with multilingual support for local households.
              </p>
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <button onClick={onDemo} style={{background:"#FFFFFF",color:"#0F172A",border:"none",borderRadius:12,padding:"12px 18px",fontWeight:900,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Open working demo →</button>
              <button style={{background:"rgba(255,255,255,.08)",color:"#fff",border:"1px solid rgba(255,255,255,.18)",borderRadius:12,padding:"12px 18px",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Export pilot brief</button>
            </div>
          </div>

          <div style={{background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:18,padding:20}}>
            <div style={{fontSize:12,color:"#64748B",fontWeight:900,textTransform:"uppercase",letterSpacing:".06em",marginBottom:14}}>Pilot impact model</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {GOV_METRICS.map(m=>(
                <div key={m.label} style={{border:"1px solid #E2E8F0",borderRadius:12,padding:"14px",background:"#F8FAFC"}}>
                  <div style={{fontSize:26,fontWeight:950,color:"#0F172A",lineHeight:1}}>{m.value}</div>
                  <div style={{fontSize:12,fontWeight:800,color:"#334155",marginTop:7}}>{m.label}</div>
                  <div style={{fontSize:11,color:"#64748B",lineHeight:1.45,marginTop:3}}>{m.sub}</div>
                </div>
              ))}
            </div>
            <div style={{marginTop:14,background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:12,padding:"12px 14px",fontSize:12,color:"#1E3A8A",lineHeight:1.55}}>
              Position this as an operational tool for centres first, with parent convenience as the adoption driver.
            </div>
          </div>
        </section>

        <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14,marginBottom:18}}>
          <div style={{background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:16,padding:18}}>
            <div style={{fontSize:13,fontWeight:900,marginBottom:12}}>Why government would care</div>
            {["Improves parent-centre communication reliability","Supports multilingual and multi-caregiver households","Creates measurable operational efficiency for educators","Standardises consent and reminder workflows across centres"].map(x=>(
              <div key={x} style={{display:"flex",gap:9,fontSize:13,color:"#334155",lineHeight:1.55,marginBottom:10}}><span style={{color:"#059669",fontWeight:900}}>✓</span>{x}</div>
            ))}
          </div>

          <div style={{background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:16,padding:18}}>
            <div style={{fontSize:13,fontWeight:900,marginBottom:12}}>Trust and compliance controls</div>
            {TRUST_CONTROLS.map(x=>(
              <div key={x} style={{display:"flex",gap:9,fontSize:13,color:"#334155",lineHeight:1.55,marginBottom:10}}><span style={{color:"#2563EB",fontWeight:900}}>•</span>{x}</div>
            ))}
          </div>

          <div style={{background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:16,padding:18}}>
            <div style={{fontSize:13,fontWeight:900,marginBottom:12}}>Recommended procurement path</div>
            {PROCUREMENT_STEPS.map((s,i)=>(
              <div key={s.phase} style={{display:"flex",gap:10,marginBottom:12}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:"#0F172A",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,flexShrink:0}}>{i+1}</div>
                <div>
                  <div style={{fontSize:12,fontWeight:900,color:"#0F172A"}}>{s.phase}</div>
                  <div style={{fontSize:12,color:"#64748B",lineHeight:1.45}}>{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={{background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:16,padding:18}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,flexWrap:"wrap",marginBottom:14}}>
            <div>
              <div style={{fontSize:13,fontWeight:900}}>Product gaps to close before a serious government pitch</div>
              <div style={{fontSize:12,color:"#64748B",marginTop:3}}>These should become real backend features, not just prototype labels.</div>
            </div>
            <button onClick={onDemo} style={{background:"#0F172A",color:"#fff",border:"none",borderRadius:11,padding:"10px 14px",fontSize:12,fontWeight:900,cursor:"pointer",fontFamily:"inherit"}}>Review app flow</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
            {["No API keys in frontend code","Singpass/CorpPass or school SSO option","Teacher approval queue for AI-extracted tasks","Audit log export for centre admins","Data retention and deletion settings","Accessibility testing for parents and educators"].map(item=>(
              <div key={item} style={{background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:12,padding:"11px 12px",fontSize:12,fontWeight:750,color:"#334155"}}>{item}</div>
            ))}
          </div>
        </section>
      </div>
    </motion.div>
  );
}

// ── CENTRE ADMIN CONSOLE ─────────────────────────────────────────────────────
function AdminConsoleScreen({onBack,onTeacher}){
  const [retention,setRetention]=useState("24 months");
  const [aiApproval,setAiApproval]=useState(true);
  const [notifications,setNotifications]=useState({push:true,email:true,sms:false,whatsapp:false});
  const channels=[
    ["push","Push"],
    ["email","Email"],
    ["sms","SMS"],
    ["whatsapp","WhatsApp"],
  ];

  return (
    <motion.div {...fd} style={{minHeight:"100vh",background:"#F8FAFC",color:"#0F172A",fontFamily:"DM Sans,Helvetica Neue,sans-serif",paddingBottom:50}}>
      <div style={{background:"#FFFFFF",borderBottom:"1px solid #E2E8F0",height:58,padding:"0 20px",display:"flex",alignItems:"center",gap:14,position:"sticky",top:0,zIndex:20}}>
        <button onClick={onBack} style={{background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:800}}>← Back</button>
        <div style={{fontWeight:950,fontSize:15,flex:1}}>Centre Admin Console</div>
        <button onClick={onTeacher} style={{background:"#0F172A",color:"#fff",border:"none",borderRadius:10,padding:"8px 12px",fontSize:12,fontWeight:900,cursor:"pointer",fontFamily:"inherit"}}>Teacher portal</button>
      </div>

      <div style={{maxWidth:1040,margin:"0 auto",padding:"26px 20px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:18,flexWrap:"wrap",marginBottom:20}}>
          <div>
            <h1 style={{fontSize:28,lineHeight:1.1,letterSpacing:"-.02em",fontWeight:950,margin:"0 0 8px"}}>Operate ParentTask SG safely at centre level.</h1>
            <p style={{fontSize:14,color:"#64748B",lineHeight:1.6,margin:0,maxWidth:650}}>Monitor pilot outcomes, configure retention and notification policy, and review audit trails for messages, broadcasts, and consent submissions.</p>
          </div>
          <GovBadge>Admin governed</GovBadge>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,marginBottom:18}}>
          {PILOT_KPIS.map(k=>(
            <div key={k.label} style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:14,padding:"15px"}}>
              <div style={{fontSize:26,fontWeight:950,color:"#0F172A",lineHeight:1}}>{k.value}</div>
              <div style={{fontSize:12,fontWeight:900,color:"#334155",marginTop:7}}>{k.label}</div>
              <div style={{fontSize:11,color:"#64748B",marginTop:3}}>{k.target}</div>
            </div>
          ))}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14,marginBottom:18}}>
          <section style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:16,padding:18}}>
            <div style={{fontSize:14,fontWeight:950,marginBottom:12}}>Compliance controls</div>
            {COMPLIANCE_SETTINGS.map(s=>(
              <div key={s.label} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"10px 0",borderBottom:"1px solid #F1F5F9"}}>
                <div>
                  <div style={{fontSize:12,fontWeight:900,color:"#0F172A"}}>{s.label}</div>
                  <div style={{fontSize:11,color:"#64748B",marginTop:2}}>{s.detail}</div>
                </div>
                <div style={{fontSize:12,fontWeight:900,color:"#047857",whiteSpace:"nowrap"}}>{s.value}</div>
              </div>
            ))}
          </section>

          <section style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:16,padding:18}}>
            <div style={{fontSize:14,fontWeight:950,marginBottom:12}}>Policy settings</div>
            <label style={{display:"block",fontSize:11,fontWeight:900,color:"#475569",textTransform:"uppercase",letterSpacing:".05em",marginBottom:6}}>Data retention</label>
            <select value={retention} onChange={e=>setRetention(e.target.value)} style={{width:"100%",border:"1px solid #CBD5E1",borderRadius:10,padding:"10px 12px",fontSize:13,marginBottom:14,background:"#fff"}}>
              {["12 months","24 months","36 months"].map(x=><option key={x}>{x}</option>)}
            </select>
            <label style={{display:"flex",alignItems:"center",gap:10,fontSize:13,fontWeight:800,color:"#334155",marginBottom:14,cursor:"pointer"}}>
              <input type="checkbox" checked={aiApproval} onChange={e=>setAiApproval(e.target.checked)}/>
              Require teacher approval for AI-extracted tasks
            </label>
            <div style={{fontSize:11,fontWeight:900,color:"#475569",textTransform:"uppercase",letterSpacing:".05em",marginBottom:8}}>Notification channels</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {channels.map(([key,label])=>(
                <button key={key} onClick={()=>setNotifications(p=>({...p,[key]:!p[key]}))}
                  style={{border:`1px solid ${notifications[key]?"#86EFAC":"#CBD5E1"}`,background:notifications[key]?"#F0FDF4":"#fff",color:notifications[key]?"#166534":"#475569",borderRadius:10,padding:"9px 10px",fontSize:12,fontWeight:900,cursor:"pointer",fontFamily:"inherit"}}>
                  {notifications[key]?"✓ ":""}{label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <section style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:16,padding:18}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:12}}>
            <div>
              <div style={{fontSize:14,fontWeight:950}}>Audit log</div>
              <div style={{fontSize:12,color:"#64748B",marginTop:2}}>Every parent-facing action should be traceable.</div>
            </div>
            <button style={{background:"#0F172A",color:"#fff",border:"none",borderRadius:10,padding:"9px 12px",fontSize:12,fontWeight:900,cursor:"pointer",fontFamily:"inherit"}}>Export CSV</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {AUDIT_EVENTS.map(e=>(
              <div key={`${e.time}-${e.action}`} style={{display:"grid",gridTemplateColumns:"80px 120px 1fr 80px",gap:10,alignItems:"center",background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:12,padding:"10px 12px",fontSize:12}}>
                <div style={{fontWeight:900,color:"#0F172A"}}>{e.time}</div>
                <div style={{color:"#475569"}}>{e.actor}</div>
                <div style={{color:"#334155",lineHeight:1.4}}>{e.action}</div>
                <div style={{textAlign:"right",fontWeight:900,color:e.risk==="Medium"?"#B45309":"#047857"}}>{e.type}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </motion.div>
  );
}

// ── EXTRACT SCREEN ────────────────────────────────────────────────────────────
function detectMessageLanguage(message){
  if(/[一-龥]/.test(message)) return "Mandarin";
  if(/[அ-ஹ]/.test(message)) return "Tamil";
  if(/\b(ibu bapa|borang|tarikh|terima kasih|sila)\b/i.test(message)) return "Malay";
  return "English";
}

function demoExtractTasks(message){
  const lower = message.toLowerCase();
  const language = detectMessageLanguage(message);
  const tasks = [];
  const pushTask = task => {
    if(!tasks.some(t=>t.category===task.category&&t.title_en===task.title_en)) tasks.push(task);
  };

  if(lower.includes("consent")||lower.includes("permission")||lower.includes("borang")||message.includes("同意")||message.includes("சம்மத")){
    pushTask({title_en:"Submit excursion consent form",title_local:language==="Malay"?"Hantar borang kebenaran lawatan":language==="Tamil"?"சுற்றுலா சம்மத படிவத்தை சமர்ப்பிக்கவும்":language==="Mandarin"?"提交郊游同意书":"Submit excursion consent form",category:"Consent form",dueLabel:lower.includes("28 may")||message.includes("28 மே")?"28 May":"This week",priority:"High",tip_en:"Sign it before the morning rush.",tip_local:""});
  }
  if(lower.includes("pay")||lower.includes("payment")||lower.includes("paynow")||lower.includes("fee")||lower.includes("$")){
    pushTask({title_en:"Pay school fee",title_local:language==="Mandarin"?"支付学校费用":"Pay school fee",category:"Payment",dueLabel:lower.includes("27 may")?"27 May":lower.includes("25 may")?"25 May":"Before due date",priority:"Medium",tip_en:"Use child's name as payment reference.",tip_local:""});
  }
  if(lower.includes("bring")||lower.includes("pack")||lower.includes("water bottle")||lower.includes("snack")||lower.includes("covered shoes")||message.includes("带")||message.includes("hantar")){
    pushTask({title_en:"Pack required items",title_local:language==="Mandarin"?"准备需要携带的物品":"Pack required items",category:"Things to bring",dueLabel:lower.includes("tomorrow")?"Tomorrow":lower.includes("friday")?"Friday":"Before activity",priority:"High",tip_en:"Put items by the door tonight.",tip_local:""});
  }
  if(lower.includes("photo")||lower.includes("show-and-tell")||lower.includes("prepare")){
    pushTask({title_en:"Prepare activity materials",title_local:"Prepare activity materials",category:"Activity prep",dueLabel:"Before activity",priority:"Low",tip_en:"Label items with your child's name.",tip_local:""});
  }

  if(tasks.length===0){
    pushTask({title_en:"Review school reminder",title_local:language==="English"?"Review school reminder":"Review school reminder",category:"Reminder",dueLabel:"Soon",priority:"Medium",tip_en:"Check if any action is needed.",tip_local:""});
  }

  return {language,tasks};
}

function ExtractScreen({setTasks,onBack}){
  const [msg,setMsg]=useState(SAMPLES[0].text);
  const [stage,setStage]=useState("idle");
  const [result,setResult]=useState(null);
  const [steps,setSteps]=useState([]);

  const PIPE=[
    {id:"app",label:"Your App",emoji:"📱"},
    {id:"api",label:"Backend",emoji:"⚙️"},
    {id:"ai",label:"AI",emoji:"🤖"},
    {id:"done",label:"Done",emoji:"✅"},
  ];

  async function extract(){
    setStage("sending");setResult(null);setSteps([]);
    for(let i=0;i<PIPE.length;i++){
      await new Promise(r=>setTimeout(r,500+i*200));
      setSteps(p=>[...p,PIPE[i].id]);
      if(i===1)setStage("processing");
    }
    setResult(demoExtractTasks(msg));
    setStage("done");
  }

  function addTasks(){
    if(!result?.tasks?.length)return;
    const newTasks=result.tasks.map((task,i)=>({id:Date.now()+i,child:"Arielle",level:"K1",title:task.title_en,source:`Auto-extracted (${result.language})`,dueLabel:task.dueLabel,category:task.category,status:"Not done",sharedWith:[],priority:task.priority}));
    setTasks(prev=>[...newTasks,...prev]);
    onBack();
  }

  return(
    <motion.div {...fd} style={{minHeight:"100vh",background:C.bg,padding:"0 0 80px"}}>
      {/* Mobile header */}
      <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,padding:"0 20px",height:54,display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:10}}>
        <button onClick={onBack} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:20,color:C.ink,lineHeight:1,padding:4}}>←</button>
        <span style={{fontWeight:800,fontSize:16,color:C.ink}}>✨ Extract task</span>
      </div>

      <div style={{padding:"20px 16px",maxWidth:600,margin:"0 auto"}}>
        <p style={{fontSize:13,color:C.muted,margin:"0 0 16px",lineHeight:1.6}}>Paste any school message. The app auto-detects the language and action items in one pass, then creates checklist tasks for review.</p>

        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14,alignItems:"center"}}>
          <button onClick={()=>{setMsg(CONSENT_SAMPLE);setStage("idle");setResult(null);setSteps([]);}}
            style={{border:`1px solid ${C.border}`,borderRadius:20,background:C.white,color:C.ink2,cursor:"pointer",fontSize:12,padding:"6px 12px",fontWeight:700,fontFamily:"inherit"}}>
            Use sample notice
          </button>
          <span style={{fontSize:12,color:C.muted}}>Language and task type are detected automatically.</span>
        </div>

        <textarea value={msg} onChange={e=>{setMsg(e.target.value);setStage("idle");setResult(null);setSteps([]);}} rows={5}
          style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:14,padding:"14px",fontSize:14,fontFamily:"inherit",outline:"none",resize:"none",boxSizing:"border-box",lineHeight:1.7,color:C.ink,background:C.white}}/>

        {/* Pipeline */}
        <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px 20px",margin:"14px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          {PIPE.map((s,i)=>{
            const active=steps.includes(s.id);
            const cur=steps[steps.length-1]===s.id&&stage!=="done"&&stage!=="idle";
            return(
              <div key={s.id} style={{display:"flex",alignItems:"center",flex:1}}>
                <div style={{textAlign:"center",flex:1}}>
                  <motion.div animate={{scale:cur?[1,1.15,1]:1}} transition={{repeat:cur?Infinity:0,duration:.7}}
                    style={{width:36,height:36,borderRadius:12,background:active?C.ink:"#F3F4F6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,margin:"0 auto 4px",transition:"background .3s"}}>
                    {s.emoji}
                  </motion.div>
                  <div style={{fontSize:10,fontWeight:700,color:active?C.ink:C.muted,transition:"color .3s"}}>{s.label}</div>
                </div>
                {i<PIPE.length-1&&<div style={{width:20,height:2,background:steps.includes(PIPE[i+1].id)?C.ink:C.border,flexShrink:0,transition:"background .4s"}}/>}
              </div>
            );
          })}
        </div>

        <button onClick={extract} disabled={stage==="sending"||stage==="processing"||!msg.trim()}
          style={{width:"100%",padding:"14px",borderRadius:14,border:"none",background:stage==="sending"||stage==="processing"||!msg.trim()?"#D1D5DB":C.ink,color:"#fff",fontWeight:800,fontSize:15,cursor:stage==="sending"||stage==="processing"?"not-allowed":"pointer",fontFamily:"inherit",transition:"all .15s",marginBottom:14}}>
          {stage==="sending"||stage==="processing"?"⏳ Processing…":"✨ Extract task with AI"}
        </button>

        {stage==="error"&&(
          <div style={{background:C.redBg,border:`1px solid #FECACA`,borderRadius:12,padding:"12px 16px",fontSize:13,color:C.red,marginBottom:14}}>
            ⚠️ Connection error. Please try again.
          </div>
        )}

        <AnimatePresence>
          {stage==="done"&&result&&(
            <motion.div {...fd} style={{background:C.ink,borderRadius:18,padding:22}}>
              <div style={{fontSize:11,color:"rgba(255,255,255,.5)",marginBottom:6}}>🌐 Auto-detected language: {result.language}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.4)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:10}}>✅ Extracted {result.tasks.length} task{result.tasks.length!==1?"s":""}</div>
              <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
                {result.tasks.map((task,i)=>(
                  <div key={`${task.category}-${i}`} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.12)",borderRadius:13,padding:"12px 14px"}}>
                    <div style={{fontSize:15,fontWeight:850,color:"#fff",marginBottom:4,lineHeight:1.35}}>{task.title_en}</div>
                    {task.title_local&&task.title_local!==task.title_en&&(
                      <div style={{fontSize:13,color:"rgba(255,255,255,.58)",marginBottom:8,lineHeight:1.4}}>{task.title_local}</div>
                    )}
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontSize:11,background:"rgba(255,255,255,.12)",padding:"4px 9px",borderRadius:8,color:"#fff"}}>📂 {task.category}</span>
                      <span style={{fontSize:11,background:"rgba(255,255,255,.12)",padding:"4px 9px",borderRadius:8,color:"#fff"}}>⏰ {task.dueLabel}</span>
                      <span style={{fontSize:11,background:task.priority==="High"?"#7F1D1D":"rgba(255,255,255,.12)",padding:"4px 9px",borderRadius:8,color:task.priority==="High"?"#FCA5A5":"#fff"}}>
                        {task.priority==="High"?"🔴 Urgent":task.priority==="Medium"?"🟡 Soon":"⚪ Later"}
                      </span>
                    </div>
                    {task.tip_en&&<div style={{fontSize:12,color:"rgba(255,255,255,.45)",marginTop:8}}>💡 {task.tip_en}</div>}
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>{setStage("idle");setResult(null);setSteps([]);}} style={{flex:1,padding:"11px",borderRadius:11,border:"1px solid rgba(255,255,255,.2)",background:"transparent",color:"rgba(255,255,255,.7)",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Discard</button>
                <button onClick={addTasks} style={{flex:2,padding:"11px",borderRadius:11,border:"none",background:"#fff",color:C.ink,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>＋ Add all to checklist →</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── DASHBOARD (mobile-first) ──────────────────────────────────────────────────
function Dashboard({tasks,setTasks,onExtract,onCaregivers,onTeacher,onLogout,onConsentForm}){
  const [activeFilter,setActiveFilter]=useState("all");
  const [q,setQ]=useState("");

  const pending=tasks.filter(t=>t.status!=="Done");
  const urgent=pending.filter(t=>t.priority==="High");
  const tomorrow=pending.filter(t=>t.dueLabel==="Tomorrow");
  const done=tasks.filter(t=>t.status==="Done");

  const filterMap={all:tasks,pending,urgent,done};
  const filtered=useMemo(()=>(filterMap[activeFilter]||tasks).filter(t=>
    t.title.toLowerCase().includes(q.toLowerCase())||t.category.toLowerCase().includes(q.toLowerCase())
  ),[tasks,activeFilter,q]);

  function toggle(id){setTasks(p=>p.map(t=>t.id===id?{...t,status:t.status==="Done"?"Not done":"Done"}:t));}
  function shareT(id){setTasks(p=>p.map(t=>t.id===id&&!t.sharedWith.length?{...t,sharedWith:["Caregiver"]}:t));}

  const statCards=[
    {key:"all",emoji:"📋",label:"All tasks",value:tasks.length,accent:C.blue},
    {key:"pending",emoji:"🔄",label:"Pending",value:pending.length,accent:C.amber},
    {key:"urgent",emoji:"🔴",label:"Urgent",value:urgent.length,accent:C.red},
    {key:"done",emoji:"✅",label:"Done",value:done.length,accent:C.green},
  ];

  return(
    <div style={{minHeight:"100vh",background:C.bg,paddingBottom:80}}>
      {/* Sticky header */}
      <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,padding:"0 16px",height:54,display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:10}}>
        <span aria-hidden="true" style={{display:"grid",placeItems:"center",width:32,height:32,borderRadius:10,background:C.green,color:C.white,fontWeight:900}}>P</span>
        <span style={{fontWeight:900,fontSize:16,color:C.ink,flex:1}}>ParentTask SG</span>
        <button onClick={onCaregivers} aria-label="Manage caregivers" title="Manage caregivers" style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,color:C.ink2,fontWeight:700,fontSize:12,padding:"6px 12px",cursor:"pointer",fontFamily:"inherit"}}>👥</button>
        <button onClick={onTeacher} style={{background:C.tealBg,border:`1px solid #99F6E4`,borderRadius:9,color:C.teal,fontWeight:700,fontSize:12,padding:"6px 12px",cursor:"pointer",fontFamily:"inherit"}}>Teacher</button>
        <button onClick={onLogout} aria-label="Log out" title="Log out" style={{background:"transparent",border:"none",cursor:"pointer",fontSize:18,color:C.muted}}>←</button>
      </div>

      <div style={{padding:"20px 16px",maxWidth:640,margin:"0 auto"}}>
        {/* Greeting */}
        <div style={{marginBottom:20}}>
          <h1 style={{fontSize:27,fontWeight:800,margin:"0 0 6px",color:C.ink,letterSpacing:"-.035em"}}>Your family checklist</h1>
          <p style={{fontSize:13,color:C.muted,margin:0}}>
            {pending.length===0?"You are all caught up.":`${pending.length} task${pending.length!==1?"s":""} need your attention.`}
          </p>
        </div>

        {/* Tomorrow banner */}
        {tomorrow.length>0&&(
          <div style={{background:"#FFFBEB",border:`1px solid #FDE68A`,borderRadius:14,padding:"12px 16px",marginBottom:20,display:"flex",gap:12,alignItems:"center"}}>
            <span style={{fontSize:24,flexShrink:0}}>⏰</span>
            <div>
              <div style={{fontWeight:800,fontSize:13,color:"#92400E"}}>Prepare before tomorrow</div>
              <div style={{fontSize:12,color:"#B45309",marginTop:2,lineHeight:1.5}}>{tomorrow.map(t=>t.title).join(" · ")}</div>
            </div>
          </div>
        )}

        {/* Interactive ring stat cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10,marginBottom:20}}>
          {statCards.map(s=>(
            <RingStat key={s.key} emoji={s.emoji} label={s.label} value={s.value} total={tasks.length} accent={s.accent} active={activeFilter===s.key} onClick={()=>setActiveFilter(activeFilter===s.key?"all":s.key)}/>
          ))}
        </div>

        {/* Search */}
        <div style={{position:"relative",marginBottom:16}}>
          <svg style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:C.muted}} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search tasks…"
            style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:12,padding:"11px 14px 11px 36px",fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:C.white,color:C.ink}}/>
        </div>

        {/* Active filter label */}
        {activeFilter!=="all"&&(
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <span style={{fontSize:12,color:C.muted,fontWeight:600}}>
              Showing: <strong style={{color:C.ink}}>{statCards.find(s=>s.key===activeFilter)?.label}</strong> ({filtered.length})
            </span>
            <button onClick={()=>setActiveFilter("all")} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:12,color:C.blue,fontWeight:700,fontFamily:"inherit"}}>Clear ×</button>
          </div>
        )}

        {/* Task list */}
        <AnimatePresence>
          {filtered.length===0?(
            <motion.div {...fd} style={{background:C.white,borderRadius:16,border:`1px solid ${C.border}`,padding:"40px 20px",textAlign:"center"}}>
              <div style={{fontSize:40,marginBottom:10}}>🎉</div>
              <div style={{fontWeight:800,fontSize:16,color:C.ink,marginBottom:4}}>All clear!</div>
              <div style={{fontSize:13,color:C.muted}}>No tasks match your filter.</div>
            </motion.div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {filtered.map(task=>{
                const done=task.status==="Done";
                const pDot=task.priority==="High"?C.red:task.priority==="Medium"?C.amber:"#D1D5DB";
                return(
                  <motion.div key={task.id} layout initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:.96}} transition={{duration:.18}}>
                    <div style={{background:done?"#FAFAF8":C.white,borderRadius:16,border:`1px solid ${done?"#EFEFEA":C.border}`,padding:"14px 16px",display:"flex",gap:12,alignItems:"flex-start"}}>
                      <button onClick={()=>toggle(task.id)} aria-label="Toggle"
                        style={{width:26,height:26,borderRadius:"50%",border:`2px solid ${done?C.ink:"#D1D5DB"}`,background:done?C.ink:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,transition:"all .15s"}}>
                        {done&&<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </button>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6,alignItems:"center"}}>
                          <Pill cat={task.category}/>
                          <span style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:C.muted,fontWeight:600}}>
                            <span style={{width:5,height:5,borderRadius:"50%",background:pDot,display:"inline-block"}}/>
                            {task.priority==="High"?"Urgent":task.priority==="Medium"?"Soon":"Later"}
                          </span>
                        </div>
                        <div style={{fontSize:15,fontWeight:700,color:done?C.muted:C.ink,textDecoration:done?"line-through":"none",lineHeight:1.4,marginBottom:4}}>{task.title}</div>
                        <div style={{fontSize:11,color:C.muted,marginBottom:8}}>{task.child} · {task.level} · {task.source}</div>
                        <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
                          <span style={{fontSize:12,color:task.priority==="High"&&!done?C.red:C.muted,fontWeight:task.priority==="High"&&!done?700:400}}>⏰ {task.dueLabel}</span>
                          {task.sharedWith.length>0&&<span style={{fontSize:12,color:C.muted}}>👥 {task.sharedWith.join(", ")}</span>}
                          <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
                            {task.category==="Consent form"&&!done&&(
                              <button onClick={()=>onConsentForm(task)}
                                style={{border:"none",borderRadius:8,background:"#FEF9C3",cursor:"pointer",fontSize:11,color:"#854D0E",fontWeight:700,padding:"5px 10px"}}>
                                ✍️ Sign
                              </button>
                            )}
                            <button onClick={()=>shareT(task.id)} style={{border:`1px solid ${C.border}`,borderRadius:8,background:"transparent",cursor:"pointer",fontSize:11,color:C.muted,fontWeight:600,padding:"4px 10px"}}>
                              🔗 Share
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Fixed bottom nav */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.white,borderTop:`1px solid ${C.border}`,display:"flex",padding:"8px 16px 16px",gap:10,zIndex:20}}>
        <button onClick={onCaregivers} style={{flex:1,padding:"13px",borderRadius:14,border:`1px solid ${C.border}`,background:C.white,color:C.ink2,fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          👥 Caregivers
        </button>
        <button onClick={onExtract} style={{flex:2,padding:"13px",borderRadius:14,border:"none",background:C.ink,color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          ✨ Extract task
        </button>
      </div>
    </div>
  );
}

// ── CONSENT FORM SCREEN ───────────────────────────────────────────────────────
function ConsentFormScreen({task, onSign, onBack}){
  const [parentName, setParentName] = useState("");
  const [relationship, setRelationship] = useState("Mother");
  const [contact, setContact] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [medNeeds, setMedNeeds] = useState("None");
  const [signed, setSigned] = useState(false);
  const canSign = parentName.trim() && contact.trim() && agreed;
  const today = "22 May 2026";

  function handleSign(){
    if(!canSign) return;
    setSigned(true);
    setTimeout(()=>{
      onSign(task.id);
      onBack();
    }, 2200);
  }

  return(
    <motion.div {...fd} style={{minHeight:"100vh",background:C.bg,paddingBottom:60}}>
      {/* Header */}
      <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,padding:"0 16px",height:54,display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:10}}>
        <button onClick={onBack} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:20,color:C.ink,padding:4}}>←</button>
        <span style={{fontWeight:800,fontSize:15,color:C.ink,flex:1}}>📋 Consent Form</span>
        {task && <Pill cat="Consent form"/>}
      </div>

      <div style={{maxWidth:580,margin:"0 auto",padding:"20px 16px"}}>

        {/* Form letterhead */}
        <div style={{background:C.white,borderRadius:20,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:16}}>
          {/* School header */}
          <div style={{background:"#1a3a2a",padding:"22px 24px",textAlign:"center"}}>
            <div style={{fontSize:28,marginBottom:6}}>🌿</div>
            <div style={{fontWeight:900,fontSize:16,color:"#fff",letterSpacing:".02em"}}>Little Sprouts Childcare Centre</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.55)",marginTop:3}}>Blk 123 Tampines Ave 4, Singapore 520123 · Tel: 6781 2345</div>
          </div>

          {/* Form title */}
          <div style={{background:"#F0FDF4",borderBottom:`1px solid ${C.border}`,padding:"14px 24px",textAlign:"center"}}>
            <div style={{fontWeight:800,fontSize:17,color:"#166534"}}>PARENT / GUARDIAN CONSENT FORM</div>
            <div style={{fontSize:13,color:C.green,marginTop:2}}>Field Trip to Singapore Botanic Gardens</div>
            <div style={{fontSize:12,color:C.muted,marginTop:2}}>Friday, 30 May 2026 · 9:00am – 12:30pm</div>
          </div>

          <div style={{padding:"20px 24px"}}>
            {/* Trip details */}
            <div style={{background:C.bg,borderRadius:12,padding:"14px 16px",marginBottom:20,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Trip Details</div>
              {[
                ["Class","K2 Sunshine (Ms Priya)"],
                ["Destination","Singapore Botanic Gardens"],
                ["Date","Friday, 30 May 2026"],
                ["Departure","9:00am from school"],
                ["Return","By 12:30pm"],
                ["Transport","Chartered bus"],
                ["Fee","$5.00 (inclusive of transport)"],
                ["Bring","Light snack, water bottle, school T-shirt, covered shoes"],
              ].map(([k,v])=>(
                <div key={k} style={{display:"flex",gap:12,marginBottom:8,fontSize:13}}>
                  <span style={{color:C.muted,fontWeight:600,minWidth:90,flexShrink:0}}>{k}</span>
                  <span style={{color:C.ink}}>{v}</span>
                </div>
              ))}
            </div>

            {/* Parent details */}
            <div style={{fontSize:13,fontWeight:700,color:C.ink,marginBottom:14}}>Parent / Guardian Information</div>

            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.ink2,marginBottom:6,textTransform:"uppercase",letterSpacing:".04em"}}>Child's name</label>
              <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 13px",fontSize:14,color:C.ink}}>
                {task?.child || "Arielle"} ({task?.level || "K1"})
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.ink2,marginBottom:6,textTransform:"uppercase",letterSpacing:".04em"}}>Parent / Guardian name *</label>
              <input value={parentName} onChange={e=>setParentName(e.target.value)} placeholder="e.g. Tan Mei Ling"
                style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 13px",fontSize:14,outline:"none",boxSizing:"border-box",background:C.white,color:C.ink}}/>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <div>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:C.ink2,marginBottom:6,textTransform:"uppercase",letterSpacing:".04em"}}>Relationship</label>
                <select value={relationship} onChange={e=>setRelationship(e.target.value)}
                  style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 13px",fontSize:14,outline:"none",background:C.white,color:C.ink}}>
                  {["Mother","Father","Grandparent","Guardian","Other"].map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:C.ink2,marginBottom:6,textTransform:"uppercase",letterSpacing:".04em"}}>Contact number *</label>
                <input value={contact} onChange={e=>setContact(e.target.value)} placeholder="+65 9XXX XXXX" type="tel"
                  style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 13px",fontSize:14,outline:"none",boxSizing:"border-box",background:C.white,color:C.ink}}/>
              </div>
            </div>

            <div style={{marginBottom:20}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.ink2,marginBottom:6,textTransform:"uppercase",letterSpacing:".04em"}}>Medical / dietary needs</label>
              <input value={medNeeds} onChange={e=>setMedNeeds(e.target.value)} placeholder="e.g. Nut allergy, or type None"
                style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 13px",fontSize:14,outline:"none",boxSizing:"border-box",background:C.white,color:C.ink}}/>
            </div>

            {/* Declaration */}
            <div style={{background:"#FFFBEB",border:`1px solid #FDE68A`,borderRadius:12,padding:"14px 16px",marginBottom:18}}>
              <div style={{fontSize:12,color:"#92400E",lineHeight:1.7,marginBottom:12}}>
                I hereby give consent for my child to participate in the above-mentioned field trip organised by Little Sprouts Childcare Centre. I understand that the centre will take all necessary precautions to ensure the safety and well-being of my child during the trip.
                <br/><br/>
                <span style={{fontSize:11,color:"#B45309"}}>我已阅读并同意上述条款。/ Saya telah membaca dan bersetuju dengan syarat-syarat di atas.</span>
              </div>
              <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer"}}>
                <div onClick={()=>setAgreed(!agreed)}
                  style={{width:20,height:20,borderRadius:6,border:`2px solid ${agreed?C.green:C.border}`,background:agreed?C.green:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,cursor:"pointer",transition:"all .15s"}}>
                  {agreed&&<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 5.5l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span style={{fontSize:13,color:"#92400E",lineHeight:1.5,fontWeight:600}}>
                  I agree to the terms above and give consent for my child to attend this field trip. *
                </span>
              </label>
            </div>

            {/* Sign button */}
            <AnimatePresence mode="wait">
              {signed ? (
                <motion.div key="success" initial={{opacity:0,scale:.9}} animate={{opacity:1,scale:1}} style={{background:C.greenBg,border:`1px solid #BBF7D0`,borderRadius:14,padding:"20px",textAlign:"center"}}>
                  <div style={{fontSize:36,marginBottom:8}}>✅</div>
                  <div style={{fontWeight:800,fontSize:16,color:C.green,marginBottom:4}}>Consent form submitted!</div>
                  <div style={{fontSize:13,color:"#166534"}}>Signed by {parentName} · {today}</div>
                  <div style={{fontSize:12,color:C.muted,marginTop:6}}>Returning to checklist…</div>
                </motion.div>
              ) : (
                <motion.div key="btn">
                  <button onClick={handleSign} disabled={!canSign}
                    style={{width:"100%",padding:"14px",borderRadius:14,border:"none",background:canSign?C.green:"#D1D5DB",color:"#fff",fontWeight:800,fontSize:15,cursor:canSign?"pointer":"not-allowed",transition:"all .2s"}}>
                    ✍️ Sign &amp; Submit Consent Form
                  </button>
                  {!canSign&&(
                    <div style={{textAlign:"center",fontSize:12,color:C.muted,marginTop:8}}>
                      Please fill in your name, contact number, and tick the declaration above.
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Footer note */}
            <div style={{fontSize:11,color:C.muted,textAlign:"center",marginTop:16,lineHeight:1.6}}>
              🔒 This form is submitted securely to Little Sprouts Childcare Centre.<br/>
              A copy will be sent to your registered email address.
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App(){
  const [screen,setScreen]=useState("login");
  const [tasks,setTasks]=useState(SEED);
  const [consentTask,setConsentTask]=useState(null);

  function openConsent(task){ setConsentTask(task); setScreen("consent"); }
  function signConsent(taskId){
    setTasks(prev=>prev.map(t=>t.id===taskId?{...t,status:"Done"}:t));
    setScreen("dash");
  }

  return(
    <div style={{fontFamily:"DM Sans,Helvetica Neue,sans-serif",color:C.ink}}>
      <AnimatePresence mode="wait">
        {screen==="login"&&<motion.div key="login" {...fd}><LoginScreen onParent={()=>setScreen("setup")} onTeacher={()=>setScreen("teacher")} onGov={()=>setScreen("gov")} onAdmin={()=>setScreen("admin")}/></motion.div>}
        {screen==="gov"&&<motion.div key="gov" {...fd}><GovReadinessScreen onBack={()=>setScreen("login")} onDemo={()=>setScreen("dash")}/></motion.div>}
        {screen==="admin"&&<motion.div key="admin" {...fd}><AdminConsoleScreen onBack={()=>setScreen("login")} onTeacher={()=>setScreen("teacher")}/></motion.div>}
        {screen==="setup"&&<motion.div key="setup" {...fd}><ProfileSetupScreen onDone={()=>setScreen("dash")}/></motion.div>}
        {screen==="dash"&&<motion.div key="dash" {...fd}><Dashboard tasks={tasks} setTasks={setTasks} onExtract={()=>setScreen("extract")} onCaregivers={()=>setScreen("caregivers")} onTeacher={()=>setScreen("teacher")} onLogout={()=>setScreen("login")} onConsentForm={openConsent}/></motion.div>}
        {screen==="extract"&&<motion.div key="extract" {...fd}><ExtractScreen tasks={tasks} setTasks={setTasks} onBack={()=>setScreen("dash")}/></motion.div>}
        {screen==="caregivers"&&<motion.div key="caregivers" {...fd}><CaregiverScreen tasks={tasks} setTasks={setTasks} onBack={()=>setScreen("dash")}/></motion.div>}
        {screen==="teacher"&&<motion.div key="teacher" {...fd}><TeacherScreen onBack={()=>setScreen("login")}/></motion.div>}
        {screen==="consent"&&<motion.div key="consent" {...fd}><ConsentFormScreen task={consentTask} onSign={signConsent} onBack={()=>setScreen("dash")}/></motion.div>}
      </AnimatePresence>
      <style>{`*{box-sizing:border-box;}button,input,textarea,select{font-family:inherit;}textarea{font-family:inherit;}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #256B57;outline-offset:3px;}@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition-duration:.01ms!important;animation-duration:.01ms!important;}}`}</style>
    </div>
  );
}


