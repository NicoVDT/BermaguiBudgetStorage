/* Bermagui Budget Storage — website chat widget.
   Self-contained: injects its own styles + DOM and talks to the storage app's
   public AI endpoint. Drop into any page with:
     <script src="chat-widget.js" defer></script>
   The assistant runs on the business's own server (local AI model), reached
   over the Tailscale funnel. */
(function () {
  "use strict";
  var API = "https://bermagui-storage.tail28b3e2.ts.net/chat/stream/";
  var PHONE = "0458 131 471";

  // ---- styles (themed to match the site: bone / ink / pine) ----
  var css = `
  #bbsChatBtn{position:fixed;bottom:22px;right:22px;z-index:9999;width:60px;height:60px;
    border:none;border-radius:50%;background:#c0510a;color:#fff;font-size:26px;cursor:pointer;
    box-shadow:0 6px 18px rgba(0,0,0,.28);transition:transform .15s ease,background .15s ease;}
  #bbsChatBtn:hover{background:#e06620;transform:translateY(-2px);}
  #bbsChatBox{position:fixed;bottom:92px;right:22px;z-index:9999;width:350px;max-width:92vw;
    display:none;flex-direction:column;background:#f5f0e8;border:1px solid rgba(26,26,24,.14);
    border-radius:2px;overflow:hidden;box-shadow:0 12px 34px rgba(0,0,0,.3);
    font-family:'Satoshi',system-ui,Arial,sans-serif;}
  #bbsChatHead{background:#1a1a18;color:#fff;padding:13px 16px;display:flex;align-items:center;
    justify-content:space-between;font-size:15px;font-weight:500;}
  #bbsChatHead small{display:block;color:#c9c4bb;font-size:11px;font-weight:300;}
  #bbsChatClose{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1;}
  #bbsChatLog{height:330px;overflow-y:auto;padding:14px;background:#f5f0e8;}
  .bbsMsg{margin-bottom:10px;padding:9px 13px;border-radius:2px;max-width:85%;font-size:14px;
    line-height:1.4;white-space:pre-wrap;word-wrap:break-word;}
  .bbsMsg.user{background:#c0510a;color:#fff;margin-left:auto;}
  .bbsMsg.bot{background:#fff;color:#1a1a18;border:1px solid rgba(26,26,24,.1);
    }
  .bbsMsg.typing{display:inline-flex;gap:5px;align-items:center;}
  .bbsMsg.typing span{width:7px;height:7px;border-radius:50%;background:#b3ada2;display:inline-block;
    animation:bbsBlink 1.4s infinite both;}
  .bbsMsg.typing span:nth-child(2){animation-delay:.2s;}
  .bbsMsg.typing span:nth-child(3){animation-delay:.4s;}
  @keyframes bbsBlink{0%,80%,100%{opacity:.25;transform:translateY(0);}40%{opacity:1;transform:translateY(-4px);}}
  .bbsNote{font-size:11px;line-height:1.35;color:#8a857b;text-align:center;padding:2px 16px 10px;}
  #bbsChatForm{display:flex;gap:8px;padding:10px;background:#fff;border-top:1px solid rgba(26,26,24,.1);}
  #bbsChatInput{flex:1;border:1px solid rgba(26,26,24,.2);border-radius:2px;padding:9px 11px;
    font-size:14px;font-family:inherit;outline:none;}
  #bbsChatInput:focus{border-color:#c0510a;}
  #bbsChatSend{border:none;background:#c0510a;color:#fff;border-radius:2px;padding:0 15px;
    font-size:15px;cursor:pointer;}
  #bbsChatSend:hover{background:#e06620;}
  `;
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ---- DOM ----
  var btn = el("button", { id: "bbsChatBtn", title: "Chat with us", innerHTML: "💬" });
  var box = el("div", { id: "bbsChatBox" });
  box.innerHTML =
    '<div id="bbsChatHead"><span>Ask us anything<small>Bermagui Budget Storage</small></span>' +
    '<button id="bbsChatClose" aria-label="Close">&times;</button></div>' +
    '<div id="bbsChatLog"></div>' +
    '<form id="bbsChatForm"><input id="bbsChatInput" autocomplete="off" ' +
    'placeholder="Type your question…" required><button id="bbsChatSend" type="submit">➤</button></form>';
  document.body.appendChild(btn);
  document.body.appendChild(box);

  var log = box.querySelector("#bbsChatLog");
  var form = box.querySelector("#bbsChatForm");
  var input = box.querySelector("#bbsChatInput");
  var history = [];

  function el(tag, props) {
    var e = document.createElement(tag);
    for (var k in props) e[k] = props[k];
    return e;
  }
  function add(role, text) {
    var d = el("div", { className: "bbsMsg " + (role === "user" ? "user" : "bot") });
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }
  function toggle() {
    var open = box.style.display === "flex";
    box.style.display = open ? "none" : "flex";
    if (!open && !log.childElementCount) {
      add("bot", "G'day! Ask me about our storage options, sizes, pricing or how to get started.");
      var note = el("div", { className: "bbsNote",
        textContent: "This is an AI assistant and can occasionally get things wrong, so please confirm anything important by calling us on " + PHONE + "." });
      log.appendChild(note);
    }
  }
  btn.onclick = toggle;
  box.querySelector("#bbsChatClose").onclick = function () { box.style.display = "none"; };

  form.onsubmit = async function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    add("user", text);
    history.push({ role: "user", content: text });
    input.value = "";
    // animated typing bubble so it never looks frozen
    var thinking = el("div", { className: "bbsMsg bot typing",
      innerHTML: "<span></span><span></span><span></span>" });
    log.appendChild(thinking);
    log.scrollTop = log.scrollHeight;
    try {
      var r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history })
      });
      if (!r.ok || !r.body) throw new Error("stream unavailable");
      // Read the reply as it streams in, showing it build up live.
      var reader = r.body.getReader(), decoder = new TextDecoder(), full = "", started = false;
      while (true) {
        var res = await reader.read();
        if (res.done) break;
        var piece = decoder.decode(res.value, { stream: true });
        if (!piece) continue;
        if (!started) { thinking.classList.remove("typing"); thinking.textContent = ""; started = true; }
        full += piece;
        thinking.textContent = full;
        log.scrollTop = log.scrollHeight;
      }
      if (full.trim()) {
        history.push({ role: "assistant", content: full });
      } else {
        thinking.classList.remove("typing");
        thinking.textContent = "Sorry, please try again.";
      }
    } catch (_) {
      thinking.classList.remove("typing");
      thinking.textContent = "Sorry, something went wrong. Please call us on " + PHONE + ".";
    }
  };
})();
