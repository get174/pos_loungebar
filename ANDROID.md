# Caisse Android et administration Windows

L’application **POS Caisse** utilise React, TypeScript et Capacitor 8.6. Elle contient les écrans de caisse et communique avec le serveur Node.js. Electron conserve l’administration et l’accès à la même base PostgreSQL ; le serveur Android et Electron réutilisent la même logique de gestion des commandes. Aucun identifiant PostgreSQL n’est embarqué dans l’APK.

## Préparer le PC du commerce

1. Conserver la configuration `DATABASE_URL` existante dans `.env` et démarrer PostgreSQL.
2. Exécuter `npm install`, puis `npm run server:setup`. Cette commande ajoute un code d’association aléatoire dans `.env` sans modifier les identifiants PostgreSQL.
3. Vérifier `POS_API_HOST` : utiliser l’adresse locale du PC, ou `0.0.0.0`, pour accepter les POS du réseau. Le port par défaut est `3210`.
4. Exécuter `npm run start:server` et laisser ce processus ouvert. Le serveur doit rester allumé pendant l’utilisation des caisses Android. Pour une installation permanente, prévoir son démarrage automatique avec le PC.
5. Relancer Electron avec `npm run start:electron`. Dans **Administration → POS Android**, afficher les informations d’association : adresse du PC et code. Créer les comptes caissiers dans **Utilisateurs**.

Android et le PC doivent pouvoir communiquer sur le réseau local. Si Windows bloque le trafic, autoriser le port du serveur pour le réseau privé du commerce. Ne pas ouvrir PostgreSQL aux terminaux Android.

Pour les tests locaux, l’APK debug accepte une adresse telle que `http://192.168.1.20:3210`. Pour une installation de production, utiliser une adresse **HTTPS**, avec un certificat reconnu par Android et un reverse proxy vers le serveur local. L’APK release refuse le HTTP en clair. L’adresse affichée dans Electron est une suggestion locale ; elle n’ouvre pas le pare-feu et ne vérifie pas la disponibilité du serveur.

## Installer et associer un POS

1. Installer `release/POS-Caisse-Android-debug.apk` sur le terminal de test.
2. À la première ouverture, saisir l’adresse du serveur, un nom de caisse et le code d’association affiché par l’administrateur.
3. Se connecter avec un **compte caissier**. Un nouveau compte doit personnaliser son mot de passe avant d’accéder aux tables.

Le compte administrateur utilise Electron. L’API Android refuse les comptes administrateurs et les fonctions d’administration. Les produits, tables, prix et paramètres viennent de la même base.

## Commandes et identité du terminal

- Une commande appartient au **caissier et au terminal** qui l’ont créée. L’identité est attribuée par le serveur à l’association et vérifiée avant chaque modification, paiement ou annulation. Le client ne peut pas choisir le propriétaire de sa commande.
- Changer de caissier sur un terminal, ou utiliser le même compte sur un autre terminal, ne donne pas accès à la commande. Les tables concernées restent visibles et portent la mention du caissier propriétaire.
- L’administrateur peut ouvrir et traiter toutes les commandes depuis Electron, sans modifier leur propriétaire.
- Le secret du terminal est chiffré avec une clé Android Keystore, stocké dans les données privées de l’application et exclu des sauvegardes Android. La session caissier reste en mémoire et expire après 12 heures ; une fermeture complète demande une nouvelle connexion, sans changer l’identité du POS.
- Depuis Electron, l’administrateur peut désactiver/réactiver un terminal. Désactiver révoque ses sessions ; réactiver conserve son identité. Après réactivation, utiliser **Réessayer** puis se reconnecter.
- Une désinstallation ou un effacement des données crée une nouvelle identité à la prochaine association. Les anciennes commandes restent accessibles à l’administrateur. Ne pas effacer les données d’un POS pour résoudre une simple coupure réseau.

Les brouillons du panier sont conservés sur l’appareil et récupérés après une fermeture. Une coupure réseau empêche l’enregistrement et l’encaissement : le paiement n’est confirmé qu’après enregistrement par le serveur. Il n’y a pas de synchronisation de paiements hors ligne.

## Tickets et matériel

Le bouton d’impression ouvre le **dialogue d’impression Android** avec un document de ticket, qui peut aussi être enregistré en PDF. Il ne confirme pas que le papier est effectivement sorti. Les formats 58/80 mm restent disponibles dans les paramètres de l’établissement ; le service d’impression du terminal doit accepter le papier choisi.

L’imprimante intégrée, le tiroir, le lecteur bancaire et les SDK des fabricants ne sont pas intégrés. L’impression directe sur une imprimante propriétaire exige de connaître la marque et le modèle du POS. Tester le matériel avant une utilisation commerciale.

## Compiler

Prérequis : Node.js 22 ou supérieur, Java 21, SDK Android 36 et outils de compilation Android. Le projet natif est dans `android/`. La version minimale configurée est Android 7 (API 24) ; il faut également une WebView compatible avec Capacitor. Vérifier la version Android et la WebView du terminal réel.

```powershell
npm run android:apk
```

Cette commande compile l’interface Android, synchronise les fichiers Capacitor, installe le plugin natif local et génère un APK **debug** dans `release/POS-Caisse-Android-debug.apk`. Le plugin natif est maintenu dans `native/android/PosDevicePlugin.java` ; `scripts/configure-android.cjs` le recopie lors de chaque synchronisation. `scripts/sync-android.cjs` copie les fichiers individuellement pour éviter les erreurs de remplacement de dossiers sur certains volumes Windows. Ce projet utilise Capacitor core et son plugin local, sans plugins Cordova ; si des plugins supplémentaires sont ajoutés, adapter cette synchronisation. Les fichiers `local.properties`, caches et APK ne sont pas versionnés.

Pour une distribution définitive, ouvrir `android/` dans Android Studio, configurer une clé de signature à conserver, utiliser un serveur HTTPS puis générer un APK/AAB release signé. La signature debug est réservée aux tests.

## Vérifications

```powershell
npm run typecheck
npm run test:api
npm run test:postgres
npm run test:drafts
npm run test:electron
```

Les tests d’intégration créent et nettoient leurs propres utilisateurs, produits, commandes et terminaux. Le test PostgreSQL vérifie aussi la restauration dans une base temporaire et nécessite le droit `CREATEDB`.

Sur un émulateur de test avec une installation neuve de l’APK, `node scripts/smoke-android.cjs emulator-5554` vérifie le parcours Android réel : association, connexion, commande, paiement et conservation de l’identité. Compiler le serveur avant ce test (`npm run build:server`). Ne pas utiliser ce script sur une caisse en service.

Documentation officielle : [Capacitor Android](https://capacitorjs.com/docs/android), [installation et synchronisation](https://capacitorjs.com/docs/getting-started).
