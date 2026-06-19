# Configurazione terminale Nexi Ingenico — ECR17 via rete LAN

Questa guida copre i passi necessari sul terminale fisico per abilitare la comunicazione TCP/ECR17 con il software Gestionale Cassa.

---

## Terminali supportati

Ingenico con firmware ECR17 in modalità LAN:

| Modello | Connessione | Note |
|---|---|---|
| iCT220 / iCT250 | Ethernet (RJ-45) | Fisso da banco, consigliato |
| iWL220 / iWL250 | Wi-Fi 802.11 b/g/n | Mobile; assicurarsi di stare sulla stessa rete |
| iWL280 | Wi-Fi + Bluetooth | Uguale all'iWL220 |
| AXIUM DX8000 | Ethernet / Wi-Fi | Modello più recente — menu leggermente diverso |

> Se hai un modello diverso, la logica è la stessa; i nomi dei menu possono variare.

---

## Fase 1 — Connettere il terminale alla rete

### Terminale Ethernet (iCT250 ecc.)
1. Collega il cavo RJ-45 alla porta LAN sul retro del terminale.
2. Il terminale si connette automaticamente se il router fornisce DHCP.

### Terminale Wi-Fi (iWL220 ecc.)
1. Dal menu principale: **F** → **Impostazioni** → **Rete** → **Wi-Fi**
2. Scegli la rete Wi-Fi della sagra (SSID) e inserisci la password.
3. Attendi la conferma di connessione.

**Importante:** assegna al terminale un IP fisso (DHCP reservation sul router tramite MAC address) oppure configura un IP statico al passo successivo. Il software ha bisogno di un IP stabile.

---

## Fase 2 — Verificare / impostare l'IP del terminale

### Leggere l'IP corrente
Sul terminale, in qualsiasi schermata:

```
Tasto [.] (punto) tenuto premuto 3 secondi
→ appare l'indirizzo IP corrente e la subnet mask
```

Oppure: **F** → **Diagnostica** → **Rete** → **Info IP**

### Impostare un IP statico (opzionale ma consigliato)
1. **F** → **Impostazioni** → **Rete** → **Configurazione IP** → **Statico**
2. Inserisci:
   - **IP**: es. `192.168.1.50` (scegli un indirizzo fuori dal range DHCP del router)
   - **Subnet mask**: `255.255.255.0`
   - **Gateway**: IP del router, es. `192.168.1.1`
   - **DNS**: `8.8.8.8` o l'IP del router
3. Conferma e riavvia il terminale.

---

## Fase 3 — Abilitare la modalità ECR / Server TCP

Questa è la parte più critica: va abilitato il server TCP che ascolta le richieste dal software.

### Accesso al menu tecnico
Sul terminale (schermata principale):

```
Premi [.] + [ANNULLA] contemporaneamente
oppure tieni premuto [F] per 5 secondi
→ viene richiesto il PIN tecnico
```

PIN tecnico di default Ingenico/Nexi Italia:
- `0000` oppure `1234` oppure `1111`
- Se nessuno funziona, contatta il tuo referente Nexi (il PIN tecnico viene impostato al momento del collaudo)

### Abilitare ECR TCP
Nel menu tecnico:

```
Parametri → Comunicazioni → ECR / Cassa → Modalità ECR
→ seleziona "TCP Server" (o "LAN" / "Socket")
```

Poi imposta la **porta TCP ECR**:

```
Parametri → Comunicazioni → ECR → Porta TCP
→ inserisci il numero di porta (default consigliato: 7500)
```

Riavvia il terminale per applicare le modifiche.

### Verifica che il server stia ascoltando
Dal PC della cassa, apri un terminale e digita:

```bash
nc -zv 192.168.1.50 7500
```

Se risponde `Connection to 192.168.1.50 7500 port [tcp] succeeded` il terminale è raggiungibile.

---

## Fase 4 — Configurare il Gestionale Cassa

1. Avvia il Gestionale Cassa sul PC.
2. Premi **⚙ Terminale** in alto a destra.
3. Attiva **"Abilita pagamento con carta"**.
4. Inserisci:
   - **IP terminale**: es. `192.168.1.50`
   - **Porta TCP**: `7500` (deve corrispondere a quello configurato sul terminale)
5. Salva.

Da questo momento il pulsante **Completa** mostrerà la scelta **Contanti / Carta**.

---

## Flusso di pagamento

```
Cassiere preme "Completa"
    ↓
Modale: [Contanti]  [Carta]
    ↓ (carta)
Gestionale invia importo al terminale via TCP/ECR17
    ↓
Cliente inserisce carta e PIN sul terminale fisico
    ↓
Terminale risponde: APPROVATO → ordine completato + stampa
                    RIFIUTATO → modale offre "Riprova" o "Paga in contanti"
```

---

## Risoluzione problemi

| Sintomo | Causa probabile | Soluzione |
|---|---|---|
| "Timeout: nessuna risposta" | Terminale non raggiungibile | Verifica IP, porta, e che ECR TCP sia attivo |
| "Terminale non configurato" | Toggle disabilitato nel gestionale | ⚙ Terminale → abilita |
| "Rifiutato (codice XX)" | Carta rifiutata dal circuito | Cliente riprova o paga in contanti |
| Il terminale stampa ma il gestionale dice errore | Timeout TCP troppo breve o risposta fuori standard | Aumenta il timeout in ⚙ Terminale → Risoluzione problemi avanzata |
| Connessione OK ma frame non parsato | Versione firmware ECR con separatore/LRC diverso | Vedi nota sotto |

### Nota sulla compatibilità firmware ECR17

Il protocollo ECR17 Ingenico ha avuto revisioni nel tempo. Se il terminale risponde ma la transazione non viene riconosciuta correttamente, verificare con Nexi la versione firmware e confrontare il separatore campo (default nel gestionale: `0x1C`), il seed LRC (default: `0x7F`), l'eventuale inclusione di `STX` nel calcolo LRC, i codici operazione e l'invio di `ACK`.

Questi parametri si modificano senza ricompilare da ⚙ Terminale → Risoluzione problemi avanzata.

---

## Checklist rapida prima della sagra

- [ ] Terminale collegato alla rete (cavo o Wi-Fi)
- [ ] IP fisso assegnato (DHCP reservation o statico)
- [ ] Modalità ECR TCP abilitata, porta `7500`
- [ ] Connessione verificata con `nc -zv <IP> 7500`
- [ ] Gestionale configurato con IP e porta corretti
- [ ] Test transazione carta eseguito con importo simbolico (€0,01) prima dell'apertura
