(function () {
    const mountHeader = async () => {
        const mountEl = document.getElementById('appHeaderMount');
        if (!mountEl) return;

        const activeKey = mountEl.dataset.active || '';
        try {
            const response = await fetch('/partials/header.html', {cache: 'no-store'});
            if (!response.ok) {
                throw new Error(`Не удалось загрузить шапку: ${response.status}`);
            }
            mountEl.innerHTML = await response.text();
            mountEl.querySelectorAll('[data-nav]').forEach((link) => {
                const isActive = link.dataset.nav === activeKey;
                link.classList.toggle('active', isActive);
                if (isActive) {
                    link.setAttribute('aria-current', 'page');
                } else {
                    link.removeAttribute('aria-current');
                }
            });
        } catch (error) {
            console.error(error);
            mountEl.innerHTML = '';
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        mountHeader().catch((error) => console.error(error));
    });
})();
