/**
 * Genere l'orchestrateur quotidien. Lancer : node _build-orchestrateur.cjs
 *
 * Un seul appel par rayon : l'agent unifie porte l'etude ET le marketing.
 * 24 executions, chacune deux fois plus complete qu'avant.
 *
 * Les 24 rayons ne partent pas ensemble : chacun lit des dizaines de pages et
 * ecrit 60 Ko. En parallele on sature le reseau et on prend des refus des
 * moteurs de recherche. La boucle les traite un par un, ~13 min chacun, soit
 * environ 5 h — lance a 1h, tout est ecrit bien avant 6h.
 *
 * CONTROLE AVANT LA NUIT (ajoute le 30/09/2026)
 * -------------------------------------------------------------------------
 * La nuit du 23 septembre a montre le trou : le solde Anthropic est tombe a
 * zero, et les 24 rayons ont quand meme demarre. Chacun a fait ses ~46
 * requetes Serper et lu ses 25 pages AVANT de se casser sur l'appel Claude.
 * Resultat : 17 executions en erreur, les 2 500 credits Serper gratuits
 * brules pour rien, et zero rapport.
 *
 * On verifie donc les deux fournisseurs UNE FOIS, pour deux requetes, avant
 * d'engager la nuit. Si l'un des deux repond non, la nuit s'arrete la.
 */
const fs = require('fs');
const path = require('path');

const AGENTS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'agents.json'), 'utf8'));
const ID_AGENT = 'agentRayonUnifie';
const CRED_ANTHROPIC = { id: 'OQSfM7vv1HMr4AFo', name: 'Anthropic account' };
const CRED_SERPER = { id: 'xt0AZKIIwgFfVm2C', name: 'Serper.dev' };

const codeJour = `
/**
 * Le rayon du jour pour chaque categorie.
 *
 * Rotation par jour de l'annee modulo 7 : la meme categorie revient sur le
 * meme theme tous les 7 jours, ce qui donne la serie temporelle. Le calcul est
 * fige ici et dans marketReports.ts cote serveur — les deux doivent rester
 * d'accord, sinon un rapport tombe dans le mauvais casier.
 */
const CATEGORIES = ${JSON.stringify(AGENTS.categories)};

const maintenant = new Date();
const debut = Date.UTC(maintenant.getUTCFullYear(), 0, 1);
const jourAnnee = Math.floor((Date.now() - debut) / 86400000) + 1;
const date = maintenant.toISOString().slice(0, 10);

return CATEGORIES.map((c) => {
  const t = c.themes[(jourAnnee - 1) % 7];
  return {
    json: {
      categorie: c.id,
      theme: t.id,
      libelle_categorie: c.nom,
      libelle_theme: t.nom,
      date,
    },
  };
});
`.trim();

/**
 * Lit les deux reponses de controle et decide si la nuit peut partir.
 *
 * Les deux noeuds de controle sont en onError:continueRegularOutput : une
 * erreur HTTP ne fait pas tomber le workflow, elle arrive ici sous forme de
 * donnee. C'est exactement ce qu'on veut : on veut LIRE l'erreur et la
 * rapporter en clair, pas voir un « 400 » dans un coin de l'interface.
 */
const codeVerdict = `
function reponse(nom) {
  try {
    const it = $(nom).all();
    return (it && it.length && it[0].json) ? it[0].json : null;
  } catch (e) {
    return null;
  }
}

function texteErreur(o) {
  if (!o) return 'aucune reponse';
  // n8n range le corps d'erreur a des endroits differents selon le cas
  const cand = [o.error, o.message, o.body, o];
  for (const c of cand) {
    if (!c) continue;
    if (typeof c === 'string' && c.length) return c.slice(0, 400);
    if (typeof c === 'object') {
      const s = JSON.stringify(c);
      if (s && s !== '{}') return s.slice(0, 400);
    }
  }
  return JSON.stringify(o).slice(0, 400);
}

const problemes = [];

// --- Serper : une reponse saine porte searchParameters ou organic
const s = reponse('Controle Serper');
const serperOk = !!(s && !s.error && (s.searchParameters || s.organic || s.shopping));
if (!serperOk) {
  problemes.push(
    'SERPER refuse les requetes. Reponse : ' + texteErreur(s) +
    '\\n  -> Si le message parle de credits : le forfait gratuit (2 500 credits, une seule fois) est epuise.' +
    '\\n     Une nuit complete consomme environ 1 100 credits (24 rayons x ~46 requetes).' +
    '\\n     Recharger sur serper.dev avant de relancer.'
  );
}

// --- Claude : une reponse saine porte un id et un content
const c = reponse('Controle Claude');
const claudeOk = !!(c && !c.error && (c.content || c.id || c.type === 'message'));
if (!claudeOk) {
  problemes.push(
    'ANTHROPIC refuse les requetes. Reponse : ' + texteErreur(c) +
    '\\n  -> Si le message parle de credit balance : le solde de la cle API est a zero.' +
    '\\n     Recharger sur console.anthropic.com > Plans & Billing avant de relancer.' +
    '\\n     Une nuit complete coute environ 9 EUR (24 rapports x ~0,39 EUR).'
  );
}

if (problemes.length) {
  throw new Error(
    'NUIT ANNULEE AVANT DE DEPENSER QUOI QUE CE SOIT.\\n\\n' +
    problemes.join('\\n\\n') +
    '\\n\\nAucun rayon n a ete lance. Rien n a ete consomme au-dela de ces deux requetes de controle.'
  );
}

// Tout va bien : on rend la main aux 24 rayons du jour.
return $('Rayons du jour').all();
`.trim();

const wf = {
  id: 'orchestrateurQuotidien',
  name: 'DropPost — Orchestrateur quotidien (aiMARKET)',
  nodes: [
    {
      parameters: {
        rule: {
          interval: [{ triggerAtHour: 1, triggerAtMinute: 0 }],
        },
      },
      id: 'n-declencheur',
      name: 'Chaque nuit a 1h',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [0, 0],
    },
    {
      parameters: {},
      id: 'n-manuel',
      name: 'Lancer a la main',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [0, 180],
    },
    {
      // Meme porte que pour l'agent : permet de lancer la nuit complete a la
      // demande, sans attendre 1h et sans passer par l'interface.
      parameters: {
        httpMethod: 'POST',
        path: 'orchestrateur-nuit',
        responseMode: 'onReceived',
        options: {},
      },
      id: 'n-webhook-orch',
      name: 'Webhook lancement',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 340],
      webhookId: 'e1a7c2d4-9b30-4f58-8a61-7d3c5e2b4f91',
    },
    {
      parameters: { jsCode: codeJour },
      id: 'n-jour',
      name: 'Rayons du jour',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [220, 0],
    },

    // ------------------------------------------------ controle avant la nuit
    {
      // La requete la moins chere possible : 1 credit Serper, 1 resultat.
      parameters: {
        method: 'POST',
        url: 'https://google.serper.dev/search',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ q: "test", num: 1 }) }}',
        options: { timeout: 30000 },
      },
      id: 'n-controle-serper',
      name: 'Controle Serper',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [440, -140],
      credentials: { httpHeaderAuth: CRED_SERPER },
      // Un seul controle, pas un par rayon.
      executeOnce: true,
      // On veut LIRE l'erreur, pas la subir.
      onError: 'continueRegularOutput',
      alwaysOutputData: true,
    },
    {
      // max_tokens a 4 et pas de reflexion : la reponse est tronquee, on s'en
      // fiche. Ce qui compte est le code HTTP. Un solde a zero renvoie 400
      // AVANT toute facturation : ce controle est gratuit quand il echoue et
      // coute une fraction de centime quand il passe.
      parameters: {
        method: 'POST',
        url: 'https://api.anthropic.com/v1/messages',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'anthropicApi',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'anthropic-version', value: '2023-06-01' },
            { name: 'content-type', value: 'application/json' },
          ],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          "={{ JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 4, messages: [ { role: 'user', content: 'ok' } ] }) }}",
        options: { timeout: 60000 },
      },
      id: 'n-controle-claude',
      name: 'Controle Claude',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [660, -140],
      credentials: { anthropicApi: CRED_ANTHROPIC },
      executeOnce: true,
      onError: 'continueRegularOutput',
      alwaysOutputData: true,
    },
    {
      parameters: { jsCode: codeVerdict },
      id: 'n-verdict',
      name: 'Verdict avant la nuit',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [880, -140],
    },

    // ------------------------------------------------------------ la nuit
    {
      parameters: { options: { reset: false } },
      id: 'n-boucle',
      name: 'Un rayon a la fois',
      type: 'n8n-nodes-base.splitInBatches',
      typeVersion: 3,
      position: [1100, 0],
    },
    {
      parameters: {
        workflowId: { __rl: true, value: ID_AGENT, mode: 'id' },
        workflowInputs: {
          mappingMode: 'defineBelow',
          value: {
            categorie: '={{ $json.categorie }}',
            theme: '={{ $json.theme }}',
            libelle_categorie: '={{ $json.libelle_categorie }}',
            libelle_theme: '={{ $json.libelle_theme }}',
            date: '={{ $json.date }}',
          },
        },
        options: { waitForSubWorkflow: true },
      },
      id: 'n-agent',
      name: 'Agent rayon unifie',
      type: 'n8n-nodes-base.executeWorkflow',
      typeVersion: 1.2,
      position: [1360, 120],
      // Un rayon qui echoue ne doit pas emporter les 23 autres.
      onError: 'continueRegularOutput',
      // Une seule tentative : le 23 septembre, maxTries a 2 a double la
      // consommation Serper d'une panne qui n'avait aucune chance de passer
      // au second essai. Le controle en tete de nuit remplace le retry.
      retryOnFail: false,
    },
  ],
  connections: {
    'Chaque nuit a 1h': { main: [[{ node: 'Rayons du jour', type: 'main', index: 0 }]] },
    'Lancer a la main': { main: [[{ node: 'Rayons du jour', type: 'main', index: 0 }]] },
    'Webhook lancement': { main: [[{ node: 'Rayons du jour', type: 'main', index: 0 }]] },
    'Rayons du jour': { main: [[{ node: 'Controle Serper', type: 'main', index: 0 }]] },
    'Controle Serper': { main: [[{ node: 'Controle Claude', type: 'main', index: 0 }]] },
    'Controle Claude': { main: [[{ node: 'Verdict avant la nuit', type: 'main', index: 0 }]] },
    'Verdict avant la nuit': { main: [[{ node: 'Un rayon a la fois', type: 'main', index: 0 }]] },
    // sortie 0 = boucle terminee, sortie 1 = element courant
    'Un rayon a la fois': { main: [[], [{ node: 'Agent rayon unifie', type: 'main', index: 0 }]] },
    'Agent rayon unifie': { main: [[{ node: 'Un rayon a la fois', type: 'main', index: 0 }]] },
  },
  settings: {
    executionOrder: 'v1',
    timezone: 'Europe/Paris',
    // 'all' + saveExecutionProgress stockaient 8 a 12 Mo de pages web par
    // execution : la base n8n avait atteint 485 Mo en trois semaines. On garde
    // les donnees des echecs (c'est ce qui a permis le diagnostic du 23) et on
    // jette celles des reussites, dont le resultat est deja sur le disque.
    saveDataSuccessExecution: 'none',
    saveDataErrorExecution: 'all',
    saveExecutionProgress: false,
    executionTimeout: 28800,
  },
};

const sortie = path.join(__dirname, 'orchestrateur-quotidien.workflow.json');
fs.writeFileSync(sortie, JSON.stringify(wf, null, 2), 'utf8');
console.log('ecrit : ' + sortie);
console.log('rayons : ' + AGENTS.categories.length + ' | themes/rayon : ' + AGENTS.categories[0].themes.length);
console.log('controle avant la nuit : Serper (1 credit) + Claude (4 tokens)');
