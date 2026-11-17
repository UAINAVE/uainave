let map;
let userLocation = [35.0315, 135.7483]; // Kyoto (padrão)
let userMarker = null;
let camadasRotas = [];
let passosedenavegacao = [];
let passoAtualIndex = 0;
let watchId = null;
let jaAvisou1km = false;
let jaAvisouPerto = false;
window.onload = function() {
    iniciarMapa();
    iniciarGpsDinamico();
};

function iniciarMapa() {
    map = L.map('map').setView(userLocation, 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    userMarker = L.marker(userLocation).addTo(map)
        .bindPopup("<b>Você está aqui</b>")
        .openPopup();
}

// 1. EXTRAIR PASSOS DO TRAJETO (TURNS BY TURN - FASE 3)
async function executarBusca() {
    const destinoTexto = document.getElementById('campo-destino').value;
    if (!destinoTexto) return alert("Digite um destino!");

    try {
        // Geocoding (Converter texto em coordenadas)
        const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destinoTexto)}`;
        const geoResp = await fetch(geoUrl);
        const geoData = await geoResp.json();

        if (geoData.length === 0) return alert("Destino não encontrado!");

        const destLat = parseFloat(geoData[0].lat);
        const destLng = parseFloat(geoData[0].lon);

       // Pega a URL base limpa usando routeUrl1 (com o 1 no final!)
    const urlBase = routeUrl1.split('?')[0]; 

    // Dispara as buscas paralelas com segurança
    const results = await Promise.allSettled([
        fetch(`${urlBase}?overview=full&geometries=geojson`),
        fetch(`${urlBase}?overview=full&geometries=geojson&alternatives=true`),
        fetch(`${urlBase}?overview=full&geometries=geojson&alternatives=max`)
    ]);

    let rotasEncontradas = [];

    for (let res of results) {
        if (res.status === 'fulfilled' && res.value.ok) {
            const data = await res.value.json();
            if (data.routes && data.routes.length > 0) {
                data.routes.forEach(r => {
                    rotasEncontradas.push(r);
                });
            }
        }
    }

    const routeData = { routes: rotasEncontradas };

    if (!routeData.routes || routeData.routes.length === 0) {
        return alert("Não foi possível encontrar rotas!");
    }

        limparRotasDoMapa();

        // Desenhar Rota Principal e Alternativas
        routeData.routes.forEach((route, index) => {
            const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
            const isPrincipal = (index === 0);

            const polyline = L.polyline(coords, {
                color: isPrincipal ? '#0066FF' : '#777777',
                weight: isPrincipal ? 6 : 4,
                opacity: isPrincipal ? 0.9 : 0.6,
                dashArray: isPrincipal ? null : '6, 8'
            }).addTo(map);

            camadasRotas.push(polyline);

          // Guardar os passos da Rota Principal
        if (isPrincipal) {
            passosedenavegacao = route.legs[0].steps;
            passoAtualIndex = 0;

           // Atualizar e exibir a distância total e tempo formatado
            const distKm = (route.distance / 1000).toFixed(1);
            const totalMinutos = Math.round(route.duration / 60);
            const horas = Math.floor(totalMinutos / 60);
            const minutos = totalMinutos % 60;
            
            let textoTempo = "";
            if (horas > 0) {
                textoTempo = `${horas}h ${minutos}min`;
            } else {
                textoTempo = `${minutos}min`;
            }
            
            document.getElementById('distancia-total').innerText = `Distância total: ${distKm} km`;
            document.getElementById('tempo-total').innerText = `Tempo: ${textoTempo}`;
            document.getElementById('resumo-rota').style.display = 'block';
        }
    });


        // Ajusta o enquadramento do mapa
        const grupoRotas = new L.featureGroup(camadasRotas);
        map.fitBounds(grupoRotas.getBounds(), { padding: [50, 50] });

        // Exibe o painel de navegação curva a curva
        ativarModoNavegacao();
        atualizarPainelManobra();
// Pega as instruções da rota calculada e verifica o pedágio
if (routeData && routeData.routes && routeData.routes[0]) {
  const passos = routeData.routes[0].legs[0].steps.map(step => step.instruction || step.name || "");
  checarEosPedagio(passos);
}
    } catch (err) {
        console.error("Erro na busca:", err);
        alert("Erro ao traçar rota.");
    }
}

// Mapeia o tipo de manobra da API para ícones e frases simples
function traduzirManobra(step) {
    const type = step.maneuver.type;
    const modifier = step.maneuver.modifier;
    const name = step.name || "rua indicada";

    let icone = "⬆️";
    let texto = `Siga na ${name}`;

    if (type === "turn" || type === "new name") {
        if (modifier && modifier.includes("left")) {
            icone = "⬅️";
            texto = `Vire à esquerda na ${name}`;
        } else if (modifier && modifier.includes("right")) {
            icone = "➡️";
            texto = `Vire à direita na ${name}`;
        }
    } else if (type === "arrive") {
        icone = "🏁";
        texto = "Você chegou ao seu destino!";
    }

    return { icone, texto };
}

// Atualiza a tela com a próxima manobra
function atualizarPainelManobra() {
    if (!passosedenavegacao || passosedenavegacao.length === 0) return;

    const passo = passosedenavegacao[passoAtualIndex];
    if (!passo) return;

    const info = traduzirManobra(passo);
    const distMetros = Math.round(passo.distance);

    document.getElementById('icone-manobra').innerText = info.icone;
    document.getElementById('distancia-manobra').innerText = distMetros > 1000 ? `${(distMetros/1000).toFixed(1)} km` : `${distMetros} m`;
    document.getElementById('texto-instrucao').innerText = info.texto;
}

function ativarModoNavegacao() {
    document.getElementById('caixa-principal').style.display = 'none';
    document.getElementById('painel-manobra').style.display = 'flex';
    document.getElementById('btn-encerrar').style.display = 'block';
}

function novaBusca() {
    document.getElementById('caixa-principal').style.display = 'block';
    document.getElementById('painel-manobra').style.display = 'none';
    document.getElementById('btn-encerrar').style.display = 'none';
    
    limparRotasDoMapa();
    passosedenavegacao = [];
    centralizarNoUsuario();
}

function limparRotasDoMapa() {
    camadasRotas.forEach(layer => map.removeLayer(layer));
    camadasRotas = [];
}

function centralizarNoUsuario() {
    if (userLocation && map) {
        map.flyTo(userLocation, 16, { animate: true, duration: 1.2 });
    }
}

// 2. SEGUIR EM TEMPO REAL E ATUALIZAR MANOBRAS AUTOMATICAMENTE
function iniciarGpsDinamico() {
    if (!navigator.geolocation) return;

    watchId = navigator.geolocation.watchPosition(
        (position) => {
            userLocation = [position.coords.latitude, position.coords.longitude];

            // 1. Move o marcador no mapa
            if (userMarker) {
                userMarker.setLatLng(userLocation);
            }

            // 2. Se a rota estiver ativa, checa a distância até a próxima manobra
            if (passosedenavegacao && passosedenavegacao.length > 0) {
                checarProximaManobra(userLocation);
            }
        },
        (error) => console.warn("Aviso de GPS:", error.message),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    );
}

// Função de cálculo de distância (Fórmula de Haversine em metros)
function calcularDistanciaMetros(coords1, coords2) {
    const R = 6371000; // Raio da Terra em metros
    const dLat = (coords2[0] - coords1[0]) * Math.PI / 180;
    const dLon = (coords2[1] - coords1[1]) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(coords1[0] * Math.PI / 180) * Math.cos(coords2[0] * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Verifica se chegou na curva e avança o painel
function checarProximaManobra(posicaoAtual) {
    const passo = passosedenavegacao[passoAtualIndex];
    if (!passo) return;

    // Coordenadas da manobra atual (OSRM envia em [lng, lat])
    const pontoCurva = [passo.maneuver.location[1], passo.maneuver.location[0]];
    const distAteCurva = calcularDistanciaMetros(posicaoAtual, pontoCurva);

    // Se estiver a menos de 30 metros da curva, passa pra próxima manobra
    if (distAteCurva < 30 && passoAtualIndex < passosedenavegacao.length - 1) {
        passoAtualIndex++;
        atualizarPainelManobra();
    } else {
        // Atualiza a distância no painel em tempo real
        const distFormatada = distAteCurva > 1000 ? `${(distAteCurva/1000).toFixed(1)} km` : `${Math.round(distAteCurva)} m`;
        document.getElementById('distancia-manobra').innerText = distFormatada;
    }
}
// ==========================================
// DESTRAVA O ÁUDIO DO NAVEGADOR NO 1º CLIQUE
// ==========================================
document.body.addEventListener('click', function() {
    if (!window.vozDestravada && 'speechSynthesis' in window) {
        // Manda o navegador falar um texto vazio e sem volume só pra liberar a trava
        let falaMuda = new SpeechSynthesisUtterance("");
        falaMuda.volume = 0;
        window.speechSynthesis.speak(falaMuda);
        window.vozDestravada = true;
        console.log("A trava do navegador foi desarmada!");
    }
});
// 1. Função de matemática (Haversine) para calcular distância
function calcularDistanciaEmMetros(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Raio da Terra em metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

// 2. Variável de controle para não repetir o áudio várias vezes
let jaFicouAvisado = false;

// 3. Função para falar a instrução com a alma do Uainave
function falarInstrucaoMineira(texto) {
    speechSynthesis.cancel(); // Limpa a garganta antes de falar
    const fala = new SpeechSynthesisUtterance(texto);
    const vozes = speechSynthesis.getVoices();
    const vozBR = vozes.find(v => v.lang.toLowerCase().includes('pt'));
    
    if (vozBR) {
        fala.voice = vozBR;
    }
    speechSynthesis.speak(fala);
}

// 4. Rastreamento e cálculo em tempo real
function monitorarPosicaoGps(posicaoCarro) {
    // Confere se a rota existe e se ainda tem instruções
    if (!passosDaRota || passosDaRota.length === 0 || passoAtualIndex >= passosDaRota.length) {
        return;
    }
verificarRadaresProximos(posicaoCarro);
    const passoAtual = passosDaRota[passoAtualIndex];
    const latDestino = passoAtual.location[1];
    const lonDestino = passoAtual.location[0];

    const distancia = calcularDistanciaEmMetros(
        posicaoCarro.lat, 
        posicaoCarro.lng, 
        latDestino, 
        lonDestino
    );

    console.log(`Distância até a próxima manobra: ${Math.round(distancia)} metros`);

    // GATILHO DOS 30 METROS: Pula de instrução e solta a voz!
    // 1. AVISO ANTECIPADO (a 1 km de distância)
        if (distancia <= 1000 && distancia > 300 && !jaAvisou1km) {
            let textoFala = passoAtual.instruction;
            textoFala = textoFala.replace(/Vire à esquerda/g, "Arreda pra esquerda");
            textoFala = textoFala.replace(/Vire à direita/g, "Dobrar à direita");

            falarInstrucaoMineira(`Siga direto! Em 1 quilômetro, ${textoFala}, uai!`);
            jaAvisou1km = true;
        } 
        // 2. AVISO DE PROXIMIDADE (a 300 m) - com piada de estrada
        else if (distancia <= 300 && distancia > 30 && !jaAvisouPerto) {
            let textoFala = passoAtual.instruction;
            textoFala = textoFala.replace(/Vire à esquerda/g, "Arreda pra esquerda");
            textoFala = textoFala.replace(/Vire à direita/g, "Dobrar à direita");

            let fraseSurpresa = pegarComentarioAleatorio();
            falarInstrucaoMineira(`Prepara que tá perto! ${textoFala}, uai! ${fraseSurpresa}`);
            jaAvisouPerto = true;
        } 
        // 3. PONTO DA MANOBRA (30 m ou menos) - Avança a rota
        else if (distancia <= 30 && !jaFicouAvisado) {
            jaFicouAvisado = true;

            setTimeout(() => {
                passoAtualIndex++;
                jaFicouAvisado = false;
                jaAvisou1km = false;
                jaAvisouPerto = false;
                console.log("Avançou para a próxima instrução!");
            }, 3000);
        }
    }
// Exemplo de lista de piadas/comentários de estrada
const comentariosMineiros = [
    "Pode ir direto, tô de olho no trânsito aqui!",
    "Vai devagarzinho com o trem aí, sem correr!",
    "Ainda falta um bocado, vai rodando aí...",
    "Siga reto toda vida, uai!"
];

// Função para pegar uma frase surpresa
function pegarComentarioAleatorio() {
    const i = Math.floor(Math.random() * comentariosMineiros.length);
    return comentariosMineiros[i];
}
// Calcula a distância em metros entre duas coordenadas GPS
function calcularDistanciaEmMetros(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Raio da Terra em metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
// ==========================================
// MÓDULO DE RADARES E LOMBADAS ELETRÔNICAS (PRODUÇÃO)
// ==========================================

let radaresReais = [];
let ultimaBuscaPosicao = null;

// Busca radares e câmeras reais do OpenStreetMap em um raio de 3km
async function carregarRadaresReais(lat, lon) {
  // Evita buscas repetidas se o carro andou pouco (menos de 1km da última busca)
  if (ultimaBuscaPosicao) {
    const distDaUltimaBusca = calcularDistanciaEmMetros(lat, lon, ultimaBuscaPosicao.lat, ultimaBuscaPosicao.lon);
    if (distDaUltimaBusca < 1000) return;
  }

  ultimaBuscaPosicao = { lat, lon };

  const query = `
    [out:json][timeout:10];
    (
      node["highway"="speed_camera"](around:3000,${lat},${lon});
      node["enforcement"="maxspeed"](around:3000,${lat},${lon});
    );
    out body;
  `;

  try {
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    const data = await response.json();

    radaresReais = data.elements.map(item => ({
      id: item.id,
      lat: item.lat,
      lon: item.lon,
      velocidade: item.tags.maxspeed ? parseInt(item.tags.maxspeed) : 60,
      nome: item.tags.name || "Radar de Velocidade"
    }));
  } catch (erro) {
    console.error("Erro ao carregar radares reais:", erro);
  }
}

// Frases de alerta mineiras
const avisosRadarMineiros = [
  "Ô trem, tira o pé! Tem pardal logo ali na frente!",
  "Cuidado com a multa, sô! Câmera de velocidade chegando!",
  "Vai devagarzinho, uai! Câmera perto!",
  "Olha o radar! Tira o pé do acelerador!"
];

// Conjunto para evitar disparar alertas repetidos do mesmo radar
const radaresAlertados = new Set();

// Verifica proximidade dos radares carregados
function verificarRadaresProximos(posicaoCarro) {
  if (!posicaoCarro || !posicaoCarro.lat || !posicaoCarro.lon) return;

  // Atualiza a lista de radares reais conforme o veículo se desloca
  carregarRadaresReais(posicaoCarro.lat, posicaoCarro.lon);

  radaresReais.forEach(radar => {
    const distancia = calcularDistanciaEmMetros(
      posicaoCarro.lat,
      posicaoCarro.lon,
      radar.lat,
      radar.lon
    );

    // Alerta entre 400m e 50m do radar
    if (distancia <= 400 && distancia > 50) {
      if (!radaresAlertados.has(radar.id)) {
        radaresAlertados.add(radar.id);
        const aviso = avisosRadarMineiros[Math.floor(Math.random() * avisosRadarMineiros.length)];
        exibirAlertaNaTela(`⚠️ ${aviso} (${radar.velocidade} km/h a ${Math.round(distancia)}m)`);
      }
    }
  });
}



function exibirAlertaNaTela(mensagem) {
  const painelInstrucao = document.querySelector(".instrucao-navegacao") || document.querySelector("body");
  
  // Exibe na tela e fala a frase (síntese de voz)
  if ('speechSynthesis' in window) {
    const fala = new SpeechSynthesisUtterance(mensagem.replace("⚠️", ""));
    fala.lang = "pt-BR";
    window.speechSynthesis.speak(fala);
  }
  
  console.log(mensagem);
}
// Função simples para avisar sobre o pedágio (versão definitiva)
function checarEosPedagio(instrucoes) {
    const termosPedagio = ["pedágio", "pedagio", "toll", "expressway", "有料"];

    const temPedagio = instrucoes.some(texto => 
        termosPedagio.some(termo => texto?.toLowerCase().includes(termo))
    );

    if (temPedagio) {
        exibirAlertaNaTela("⚠️ Rota com pedágio!");
    }
}
/**
 * UaiNave - Módulo Unificado (JS)
 * 1. Caixa Postal & Telefone Globalizado
 * 2. Lógica de Busca Inteligente (Engine/API)
 */

// ==========================================
// 1. CAIXA POSTAL E TELEFONE GLOBALIZADO (UX/UI)
// ==========================================

const GlobalInputModule = {
  // Configurações de DDI e regex para validação global
  countryRules: {
    BR: { name: 'Brasil', ddi: '+55', phoneLength: 11, postalRegex: /^\d{5}-\d{3}$/ },
    US: { name: 'Estados Unidos', ddi: '+1', phoneLength: 10, postalRegex: /^\d{5}(-\d{4})?$/ },
    PT: { name: 'Portugal', ddi: '+351', phoneLength: 9, postalRegex: /^\d{4}-\d{3}$/ },
    ES: { name: 'Espanha', ddi: '+34', phoneLength: 9, postalRegex: /^\d{5}$/ }
  },

  /**
   * Formata número de telefone dinamicamente
   * @param {string} phone - Número de telefone bruto
   * @param {string} countryCode - Código ISO do país (BR, US, PT, etc)
   */
  formatPhone(phone, countryCode = 'BR') {
    const raw = phone.replace(/\D/g, '');
    const rule = this.countryRules[countryCode] || this.countryRules.BR;
    
    // Aplica formatação simples baseada na regra
    return `${rule.ddi} ${raw}`;
  },

  /**
   * Valida Caixa Postal / Código Postal (ZIP/CEP)
   * @param {string} code - Código postal
   * @param {string} countryCode - Código ISO do país
   */
  validatePostalCode(code, countryCode = 'BR') {
    const rule = this.countryRules[countryCode];
    if (!rule) return false;
    return rule.postalRegex.test(code.trim());
  },

  /**
   * Trata o payload de usuário mantendo conformidade global (Normalização)
   */
  sanitizeContactData(data) {
    const country = data.country || 'BR';
    return {
      phoneNormalized: this.formatPhone(data.phone, country),
      postalCode: data.postalCode.trim(),
      country: country,
      isValidPostal: this.validatePostalCode(data.postalCode, country)
    };
  }
};


// ==========================================
// 2. BUSCA INTELIGENTE (BACKEND / LÓGICA DE API)
// ==========================================

class UaiNaveSearchEngine {
  constructor(database = []) {
    // Base de dados mockada da aplicação
    this.db = database;
  }

  /**
   * Trata a string digitada (remove acentos e pontuações)
   */
  normalizeText(str) {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /**
   * Algoritmo de Ranking e Busca por Relevância
   * @param {string} query - Termo digitado pelo usuário
   * @param {Object} filters - Filtros adicionais (país, categoria, etc)
   */
  async search(query, filters = {}) {
    const cleanQuery = this.normalizeText(query);
    if (!cleanQuery && !filters.country) return [];

    const queryTokens = cleanQuery.split(/\s+/);

    // Simula tempo de resposta de API (Latency)
    return new Promise((resolve) => {
      setTimeout(() => {
        const results = this.db
          .map((item) => {
            let score = 0;
            const titleNorm = this.normalizeText(item.title);
            const tagsNorm = item.tags.map((t) => this.normalizeText(t));

            // Match exato no título dá pontuação máxima
            if (titleNorm === cleanQuery) score += 100;
            
            // Match parcial no título
            if (titleNorm.includes(cleanQuery)) score += 50;

            // Verificação por Tokens/Palavras
            queryTokens.forEach((token) => {
              if (titleNorm.includes(token)) score += 10;
              tagsNorm.forEach((tag) => {
                if (tag.includes(token)) score += 5;
              });
            });

            // Filtro Geográfico / Globalizado
            if (filters.country && item.country !== filters.country) {
              score = 0; // Descarta se não for do país selecionado
            }

            return { ...item, _score: score };
          })
          .filter((item) => item._score > 0)
          .sort((a, b) => b._score - a._score); // Ordena por relevância

        resolve(results);
      }, 150); // Delay simulado da API
    });
  }
}


// ==========================================
// EXEMPLO DE USO / INTEGRAÇÃO
// ==========================================

// Dados de teste (Base da API)
const mockDatabase = [
  { id: 1, title: 'Envio de Encomenda Expresso', tags: ['correio', 'caixa postal', 'frete'], country: 'BR' },
  { id: 2, title: 'International Shipping Express', tags: ['mail', 'postal box', 'freight'], country: 'US' },
  { id: 3, title: 'Caixa Postal Inteligente UaiNave', tags: ['caixa postal', 'tecnologia', 'uainave'], country: 'BR' }
];

// Instanciando a busca
const searchEngine = new UaiNaveSearchEngine(mockDatabase);

// Exemplo Prático de Execução Integrada
async function runUaiNaveApp() {
  console.log('--- 1. Validação de Contato Globalizado ---');
  const userData = {
    phone: '31999998888',
    postalCode: '30100-000',
    country: 'BR'
  };
  const contactProcessed = GlobalInputModule.sanitizeContactData(userData);
  console.log('Dados Normalizados:', contactProcessed);

  console.log('\n--- 2. Chamada da Busca Inteligente ---');
  const searchQuery = 'caixa postal';
  const searchResults = await searchEngine.search(searchQuery, { country: 'BR' });
  
  console.log(`Resultados para "${searchQuery}":`, searchResults);
}

// Executar
runUaiNaveApp();
async function runUaiNaveApp() {
  // Ajuste a variável de busca conforme o seu projeto
  const searchQuery = "UaiNave"; 
  const searchResults = await searchEngine.search(searchQuery);
  console.log(`Resultados para "${searchQuery}":`, searchResults);
}

// Função para enviar o texto para o nosso servidor seguro da UAINAVE
async function enviarParaUainave(texto) {
    try {
        const resposta = await fetch('http://localhost:3000/api/generate-speech', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: texto })
        });

        if (!resposta.ok) {
            throw new Error('Deu ruim na comunicação com o servidor da UAINAVE.');
        }

        // Recebe o áudio gerado pelo servidor e reproduz
        const blobAudio = await resposta.blob();
        const urlAudio = URL.createObjectURL(blobAudio);
        const audio = new Audio(urlAudio);
        
        audio.play();
        console.log('Copiloto a falar com sucesso!');

    } catch (erro) {
        console.error('Erro ao acionar o copiloto:', erro);
    }
}

// Executar
runUaiNaveApp();

// Exemplo de como você pode chamar o copiloto para falar depois de algo:

// Função para enviar o texto para o nosso servidor seguro da UAINAVE
async function enviarParaUainave(texto) {
    try {
        const resposta = await fetch('http://localhost:3000/api/generate-speech', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: texto })
        });

        if (!resposta.ok) {
            throw new Error('Deu ruim na comunicação com o servidor da UAINAVE.');
        }

        // Recebe o áudio gerado pelo servidor e reproduz
        const blobAudio = await resposta.blob();
        const urlAudio = URL.createObjectURL(blobAudio);
        const audio = new Audio(urlAudio);
        
        audio.play();
        console.log('Copiloto a falar com sucesso!');

    } catch (erro) {
        console.error('Erro ao acionar o copiloto:', erro);
    }
}