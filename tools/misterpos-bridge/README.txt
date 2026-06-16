Sagra MisterPOS Bridge - Windows Operator Notes
===============================================

Obiettivo
---------
Avvia MisterPOS e collega il bridge locale usato dalla pagina /cassa.
Quando il bridge e' attivo, l'app puo' caricare l'ordine direttamente nel carrello aperto di MisterPOS.

Installazione Windows
---------------------
1. Copia questa intera cartella sul PC dove e' installato MisterPOS.
2. Apri install-windows.cmd.
3. Sul Desktop comparira' "MisterPOS Sagra.cmd".
4. Durante la sagra apri MisterPOS sempre con "MisterPOS Sagra.cmd".

Installazione macOS
-------------------
1. Apri install.command.
2. Sul Desktop comparira' "MisterPOS Sagra.command".
3. Usa sempre quel collegamento per aprire MisterPOS durante la sagra.

Configurazione in /cassa
------------------------
Attiva: acceso
Host bridge desktop: IP LAN del PC MisterPOS, per esempio 192.168.1.50
Porta bridge: 8787
Tavolo UI MisterPOS: lascia il valore configurato nell'app

Su Windows, trova l'IP del PC con:
ipconfig

Su macOS, trova l'IP del Mac con:
ipconfig getifaddr en0

Verifica rapida sul computer MisterPOS
--------------------------------------
Apri nel browser:
http://127.0.0.1:8787/health

Risposta attesa:
{"ok":true}

Se il telefono non si collega
-----------------------------
- Il telefono deve essere sulla stessa LAN del computer MisterPOS.
- Usa l'IP LAN del computer MisterPOS, non 127.0.0.1.
- Verifica che la porta 8787 non sia bloccata dal firewall Windows/macOS.
- Se la pagina /cassa e' servita in HTTPS, il browser puo' bloccare chiamate HTTP verso la LAN.
- Se MisterPOS e' gia' aperto, chiudilo e riaprilo dal collegamento "MisterPOS Sagra.cmd" su Windows o "MisterPOS Sagra.command" su macOS.

Requisiti
---------
- MisterPOS installato sul computer cassa. Se non viene trovato, imposta MISTERPOS_DIR alla cartella con misterpos.jar.
- JDK Java 11 o superiore installato, non solo JRE. Il JDK deve includere jdk.attach.
