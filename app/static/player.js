(() => {
  const $ = selector => document.querySelector(selector);
  const video = $("#video-preview"), root = $("#mc-player"), seek = $("#player-seek"), play = $("#player-play"), overlay = $("#play-recording");
  let thumbs = [], reportDuration = 0, checkpoint = 0;
  const duration = () => Number.isFinite(video.duration) ? video.duration : 0;
  const clock = sec => { sec = Math.max(0, Math.floor(sec || 0)); return `${String(Math.floor(sec / 60)).padStart(2,"0")}:${String(sec % 60).padStart(2,"0")}`; };
  function notice(message) { $("#player-message").textContent = message; $("#player-message").hidden = !message; }
  function update() {
    const available = duration() > 0 && !video.error;
    [play, seek, $("#player-back"), $("#player-forward")].forEach(control => control.disabled = !available);
    seek.max = duration() || 100; seek.value = video.currentTime || 0;
    seek.setAttribute("aria-valuetext", `${clock(video.currentTime)} из ${clock(duration())}`);
    $("#player-xp").style.width = `${duration() ? video.currentTime / duration() * 100 : 0}%`;
    $("#player-time").textContent = `${clock(video.currentTime)} / ${clock(duration())}`;
    play.setAttribute("aria-label", video.paused ? "Воспроизвести" : "Пауза");
    $("#player-play-icon").setAttribute("d", video.paused ? "M4 2h3v2h3v2h3v4h-3v2H7v2H4z" : "M3 2h4v12H3zM10 2h4v12h-4z");
    if (!video.paused) overlay.hidden = true;
    if (Math.abs(video.currentTime - checkpoint) > 2) {
      checkpoint = video.currentTime;
      sessionStorage.setItem("forte-playback", JSON.stringify({id:sessionStorage.getItem("fortebank-current-video"), time:checkpoint}));
    }
  }
  async function togglePlay() {
    if (video.error || !duration()) { notice("Этот кодек не воспроизводится в браузере. Кадры событий появятся в отчёте."); return; }
    if (!video.paused) video.pause();
    else { try { await video.play(); notice(""); } catch { notice("Не удалось запустить видео. Повторите нажатие на воспроизведение."); } }
  }
  function jump(time) {
    if (!duration() || video.error) { notice("Перемотка недоступна для этого кодека."); return; }
    overlay.hidden = true;
    video.currentTime = Math.min(Math.max(0, time), duration());
    update();
  }
  play.addEventListener("click", togglePlay); overlay.addEventListener("click", togglePlay);
  video.addEventListener("click", togglePlay);
  $("#player-back").addEventListener("click", () => jump(video.currentTime - 5));
  $("#player-forward").addEventListener("click", () => jump(video.currentTime + 5));
  seek.addEventListener("input", () => jump(Number(seek.value)));
  function volumeState() {
    const muted = video.muted || video.volume === 0;
    $("#player-volume").value = muted ? 0 : video.volume;
    $("#player-mute").setAttribute("aria-pressed", String(muted));
    $("#player-mute").setAttribute("aria-label", muted ? "Включить звук видео" : "Выключить звук видео");
    $("#player-volume-icon").setAttribute("d", muted ? "M10 4h2v2h2V4h2v2h-2v4h2v2h-2v-2h-2v2h-2v-2h2V6h-2z" : "M10 4h2v8h-2zM13 2h2v12h-2z");
  }
  $("#player-mute").addEventListener("click", () => { video.muted = !video.muted; if (!video.muted && video.volume === 0) video.volume = .5; volumeState(); });
  $("#player-volume").addEventListener("input", event => { video.volume = Number(event.target.value); video.muted = video.volume === 0; });
  video.addEventListener("volumechange", volumeState);
  const speeds = [.5, 1, 1.5, 2];
  $("#player-speed").addEventListener("click", () => {
    video.playbackRate = speeds[(speeds.indexOf(video.playbackRate) + 1) % speeds.length];
    $("#player-speed").textContent = `${video.playbackRate}×`;
    $("#player-speed").setAttribute("aria-label", `Скорость воспроизведения: ${video.playbackRate}×`);
  });
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.requestFullscreen(); }
    catch { root.classList.toggle("theater"); notice(root.classList.contains("theater") ? "Режим просмотра. F или Esc — вернуться." : ""); }
  }
  $("#player-fullscreen").addEventListener("click", fullscreen);
  function screenState() { $("#player-fullscreen").setAttribute("aria-label", document.fullscreenElement || root.classList.contains("theater") ? "Выйти из полного экрана" : "Полный экран"); }
  document.addEventListener("fullscreenchange", screenState);
  root.addEventListener("keydown", event => {
    if (event.target.matches("input") || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest("button") && [" ","Enter"].includes(event.key)) return;
    const action = {" ":togglePlay, ArrowLeft:()=>jump(video.currentTime-5), ArrowRight:()=>jump(video.currentTime+5), f:fullscreen, F:fullscreen, m:()=>$("#player-mute").click(), M:()=>$("#player-mute").click(), Escape:()=>{root.classList.remove("theater");screenState();}}[event.key];
    if (action) { event.preventDefault(); action(); }
  });
  for (const type of ["timeupdate","play","pause","ended","loadedmetadata","durationchange","error","emptied"]) video.addEventListener(type, update);
  video.addEventListener("loadedmetadata", () => {
    try { const saved = JSON.parse(sessionStorage.getItem("forte-playback")); if (saved?.id === sessionStorage.getItem("fortebank-current-video") && Number.isFinite(saved.time)) video.currentTime = Math.min(saved.time, Math.max(0,duration()-1)); } catch {}
  });
  video.addEventListener("waiting", () => notice("Загрузка кадра…")); video.addEventListener("playing", () => notice(""));
  video.addEventListener("seeked", () => notice(""));
  const preview = $("#seek-preview"), wrap = $("#player-seek-wrap");
  wrap.addEventListener("pointermove", event => {
    if (!duration() || event.pointerType === "touch") return;
    const box = wrap.getBoundingClientRect(), fraction = Math.min(1,Math.max(0,(event.clientX-box.left)/box.width));
    preview.hidden = false; preview.style.left = `${Math.max(0,Math.min(box.width-144,fraction*box.width-72))}px`;
    preview.querySelector("span").textContent = clock(fraction * duration());
    const thumb = thumbs[Math.min(thumbs.length-1,Math.floor(fraction * thumbs.length))];
    if (thumb) preview.querySelector("img").src = `data:image/jpeg;base64,${thumb}`; else preview.querySelector("img").removeAttribute("src");
  });
  wrap.addEventListener("pointerleave", () => {preview.hidden = true;});
  window.MinecraftPlayer = {
    jump,
    setReport(details, findings) {
      thumbs = details?.thumbs || []; reportDuration = details?.video?.duration_sec || duration();
      const activity = $("#player-activity"); activity.replaceChildren();
      const values = details?.activity || [], step = Math.max(1,Math.ceil(values.length/120));
      for (let i=0;i<values.length;i+=step) { const bar = document.createElement("i"); bar.style.height = `${Math.max(8,Math.max(...values.slice(i,i+step))*100)}%`; activity.append(bar); }
      const markers = $("#player-markers"); markers.replaceChildren();
      [...findings.map(x=>({...x,review:false})),...(details?.review || []).map(x=>({timecode_sec:x.timecode,type:x.rule.title,review:true}))].forEach((item,index) => {
        if (!reportDuration) return;
        const button = document.createElement("button"); button.type="button"; button.className=`player-marker${item.review?" review":""}`;
        button.style.left = `${Math.min(100,Math.max(0,item.timecode_sec/reportDuration*100))}%`;
        button.setAttribute("aria-label", `${item.review?"На проверку":"Событие"} ${index+1}: ${item.type}, ${clock(item.timecode_sec)}`);
        button.title = `${item.type} · ${clock(item.timecode_sec)}`;
        button.addEventListener("click",()=>{video.pause();jump(item.timecode_sec);}); markers.append(button);
      });
    }
  };
  update(); volumeState();
})();
