# Installazione — Sagra della Pizza Gestionale

Guida all'installazione del gestionale su Windows e macOS.

---

## Prerequisiti di sviluppo (solo per chi crea il pacchetto)

| Strumento | Versione minima | Note |
|-----------|----------------|-------|
| Node.js | 20 LTS | |
| npm | 10+ | incluso con Node.js |
| Python | 3.x | richiesto da `node-gyp` per `better-sqlite3` |
| Windows Build Tools | — | solo Windows: `npm install -g windows-build-tools` oppure Visual Studio con "C++ Desktop Development" |
| Xcode Command Line Tools | — | solo macOS: `xcode-select --install` |

---

## Creare il pacchetto di distribuzione

### Metodo consigliato: GitHub Actions (CI)

Il repository include `.github/workflows/build.yml`.  
Basta creare un tag di versione e fare push — GitHub costruisce automaticamente il DMG (su macOS) e l'installer NSIS (su Windows) in parallelo:

```bash
git tag v1.0.0
git push --tags
```

Gli installer pronti si scaricano dalla scheda **Actions → Build installers → Artifacts** su GitHub.

> **Perché non si può compilare il pacchetto Windows su Mac?**  
> `better-sqlite3` contiene codice nativo (`.node`) che deve essere compilato per la piattaforma di destinazione. Un Mac non può compilare binari Windows senza una toolchain completa, quindi il risultato crasherebbe all'avvio. GitHub Actions usa runner nativi per ciascuna piattaforma e risolve il problema automaticamente.

---

### Metodo manuale (build locale)

### 1. Installare le dipendenze e ricompilare il modulo nativo

```bash
# dalla root del monorepo
npm install

# dalla cartella apps/desktop — ricompila better-sqlite3 per la versione di Electron corrente
cd apps/desktop
npm run postinstall
```

### 2. Generare l'icona ad alta risoluzione (consigliato)

L'icona attuale (`build/icon.png`) è 256×256. Per una resa ottimale su macOS Retina sostituirla con una versione **1024×1024** mantenendo lo stesso nome file.

### 3. Build e packaging

```bash
# macOS (DMG universale x64 + arm64)
npm run package:mac

# Windows (NSIS x64) — eseguire su una macchina Windows
npm run package:win

# Entrambi in un'unica esecuzione (non consigliato per moduli nativi — vedi nota)
npm run package
```

> **Nota sui moduli nativi**: `better-sqlite3` contiene codice nativo (`.node`).  
> Compilare sempre il pacchetto Windows **su una macchina Windows** e il pacchetto macOS **su un Mac**.  
> La cross-compilazione tra piattaforme diverse non è supportata con moduli nativi.

Il pacchetto finito si trova in `apps/desktop/dist/`:
- macOS → `Sagra della Pizza-<versione>-universal.dmg`
- Windows → `Sagra della Pizza Setup <versione>.exe`

---

## Installazione su macOS

### Passo 1 — Aprire il DMG

Fare doppio clic sul file `.dmg`. Trascinare l'icona **Sagra della Pizza** nella cartella **Applicazioni**.

### Passo 2 — Aggirare il blocco Gatekeeper (app non firmata)

Poiché l'app non è firmata con un certificato Apple Developer, macOS la blocca al primo avvio.

**Metodo A (consigliato):**
1. Nel Finder, navigare in **Applicazioni**
2. Fare **clic destro** (o Control+clic) sull'icona dell'app
3. Scegliere **Apri** dal menu contestuale
4. Nella finestra di dialogo cliccare **Apri** per confermare
5. Dall'avvio successivo l'app si apre normalmente con doppio clic

**Metodo B (da Terminale):**
```bash
xattr -cr "/Applications/Sagra della Pizza.app"
```

### Passo 3 — Prima configurazione

All'avvio aprire il menu hamburger (☰) → **Cassa / Rete** e configurare:
- **Nome cassa**: es. `Cassa 1`
- **Ruolo**: `Host` per la cassa principale (quella con il database), `Client` per le altre
- Se ruolo Client: inserire l'URL host, es. `http://192.168.1.10:7331`

---

## Installazione su Windows

### Passo 1 — Eseguire il setup

Fare doppio clic su `Sagra della Pizza Setup <versione>.exe`.

### Passo 2 — Aggirare SmartScreen (app non firmata)

Windows SmartScreen potrebbe bloccare l'installer perché non è firmato digitalmente.

1. Nella finestra "PC protetto da Windows" cliccare **Altre informazioni**
2. Cliccare **Esegui comunque**
3. Seguire la procedura guidata di installazione

### Passo 3 — Scelta della cartella di installazione

L'installer NSIS permette di scegliere la directory. La posizione predefinita è:
```
C:\Users\<utente>\AppData\Local\Programs\Sagra della Pizza
```

### Passo 4 — Prima configurazione

Stessa procedura descritta per macOS al Passo 3.

---

## Rete multi-cassa (LAN)

Il gestionale supporta più casse collegate nella stessa rete locale:

```
Host (con database SQLite)
  └── porta 7331 (HTTP + WebSocket)
        ├── Cassa 2 (Client)
        ├── Cassa 3 (Client)
        └── ...
```

### Configurazione Host

1. ☰ → **Cassa / Rete**
2. Ruolo: **Host**
3. Porta server: `7331` (o altra porta libera)
4. Assicurarsi che il firewall di sistema permetta connessioni in entrata sulla porta scelta

### Configurazione Client

1. ☰ → **Cassa / Rete**
2. Ruolo: **Client**
3. URL Host: `http://<IP-della-cassa-host>:<porta>` — es. `http://192.168.1.10:7331`

Per trovare l'IP della cassa host su macOS: `Impostazioni di Sistema → Wi-Fi → Dettagli`.  
Su Windows: `ipconfig` nel Prompt dei comandi (cercare "Indirizzo IPv4").

---

## Configurazione stampante termica

☰ → **Stampante**

| Tipo di connessione | Come configurare |
|--------------------|-----------------|
| **Rete (LAN)** | Inserire IP e porta (default 9100) della stampante |
| **USB** | Cliccare "Cerca stampanti" e selezionare dalla lista.<br>macOS: la stampante deve essere prima aggiunta in *Impostazioni di Sistema → Stampanti e Scanner*.<br>Windows: inserire la porta COM (es. `COM3`) o il nome stampante. |

Usare **Stampa test** per verificare la connessione prima del servizio.

Se una stampante USB viene vista dal sistema ma la stampa test fallisce, aprire **Risoluzione problemi avanzata** nella stessa schermata. Da lì si possono cambiare senza ricompilare l'app la modalità di invio USB, il comando CUPS (`lp`/`lpr`), l'opzione raw e i timeout della stampa di rete.

---

## Aggiornamento del catalogo sul sito web

Il gestionale esporta il catalogo nel formato compatibile con `sagradellapizza.it`:

1. ☰ → **Catalogo**
2. Modificare prezzi, voci, stazioni
3. Cliccare **Esporta menu.json**
4. Copiare il file generato in `src/lib/data/menu.json` nel repository del sito web
5. Fare deploy del sito (es. `git push` → Vercel)

---

## Struttura dei dati

Il database SQLite viene salvato automaticamente in:

| Piattaforma | Percorso |
|-------------|---------|
| macOS | `~/Library/Application Support/Sagra della Pizza/gestionale.db` |
| Windows | `C:\Users\<utente>\AppData\Roaming\Sagra della Pizza\gestionale.db` |

Fare un backup di questo file prima di ogni sagra e al termine di ogni serata.
