// ===== Back: history.back() с резервом на главную =====
function goBack(){
  // в мини-аппах бывает пустая история — делаем запасной переход
  if (document.referrer && document.referrer !== location.href && history.length > 1){
    history.back();
  } else {
    window.location.href = "../index.html";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("backBtn")?.addEventListener("click", goBack);
});
