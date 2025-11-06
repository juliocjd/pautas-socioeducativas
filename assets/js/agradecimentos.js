document.addEventListener('DOMContentLoaded', async () => {
    let parlamentares = [];
    let congressistasExtras = {};

    async function loadData() {
        try {
            const [parlamentaresRes, extrasRes] = await Promise.all([
                fetch('/parlamentares_cache.json'),
                fetch('/api/congressistas_extras.json')
            ]);
            parlamentares = (await parlamentaresRes.json()).parlamentares;
            congressistasExtras = await extrasRes.json();
        } catch (error) {
            console.error("Erro ao carregar dados dos parlamentares:", error);
        }
    }

    async function embedInstagramPosts() {
        const postElements = document.querySelectorAll('.instagram-post');
        for (const el of postElements) {
            const postUrl = el.dataset.postUrl;
            if (postUrl) {
                try {
                    const response = await fetch(`https://api.instagram.com/oembed?url=${postUrl}`);
                    const data = await response.json();
                    if (data.html) {
                        el.innerHTML = data.html;
                    }
                } catch (error) {
                    console.error("Erro ao carregar post do Instagram:", error);
                    el.innerHTML = `<a href="${postUrl}" target="_blank">Ver post no Instagram</a>`;
                }
            }
        }
    }

    function setupAgradecerButtons() {
        document.querySelectorAll('.btn-agradecer').forEach(button => {
            button.addEventListener('click', (e) => {
                const parlamentarNome = e.target.dataset.parlamentar;
                const mensagem = e.target.dataset.mensagem;

                const parlamentar = parlamentares.find(p => p.nome === parlamentarNome);
                if (parlamentar && congressistasExtras[parlamentar.id] && congressistasExtras[parlamentar.id].instagram) {
                    const instagramUsername = congressistasExtras[parlamentar.id].instagram;
                    navigator.clipboard.writeText(mensagem).then(() => {
                        window.open(`https://www.instagram.com/${instagramUsername}/`, '_blank');
                        alert('O perfil do parlamentar no Instagram foi aberto em uma nova aba. A mensagem de agradecimento foi copiada para sua área de transferência. Cole a mensagem para enviá-la.');
                    });
                } else {
                    alert('Não foi possível encontrar o perfil do Instagram para este parlamentar.');
                }
            });
        });
    }

    await loadData();
    embedInstagramPosts();
    setupAgradecerButtons();
    
    // Since Instagram embeds can be slow, we might need to re-run the script that processes them
    // after the embed script has loaded and rendered the iframe.
    setTimeout(() => {
        if (window.instgrm) {
            window.instgrm.Embeds.process();
        }
    }, 2000);
});
