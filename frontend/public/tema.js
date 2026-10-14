/* Aplica o tema salvo antes do primeiro desenho (evita piscar do escuro para o claro) */
try { var t = localStorage.getItem('ft-theme'); if (t === 'light') document.documentElement.dataset.theme = 'light'; } catch (e) {}
try { if (localStorage.getItem('ft-hide-values') === 'true') document.documentElement.dataset.hideValues = 'true'; } catch (e) {}
