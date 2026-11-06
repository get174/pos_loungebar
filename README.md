# POS Lounge Bar — PostgreSQL local

Application de caisse avec React : Electron sous Windows pour l’administration et APK Android pour les caissiers. Electron accède à PostgreSQL depuis son processus principal ; Android utilise le serveur Node.js, connecté à la même base. Le navigateur seul ne permet pas d’utiliser la caisse. Voir [le guide Android et serveur](ANDROID.md) pour l’installation, l’association des terminaux et la compilation de l’APK.

## Démarrer

1. Démarrer PostgreSQL et créer une base vide `pos_db` si nécessaire.
2. Configurer `DATABASE_URL` dans `.env` à la racine, suivant `.env.example`.
3. `npm install`
4. `npm run db:check`
5. `npm run start:electron` ou `npm run dev` pour le développement.

Sous Windows, le rendu logiciel est utilisé pour éviter les blocages de démarrage liés aux pilotes graphiques. Le lanceur retire également `ELECTRON_RUN_AS_NODE` de l'environnement du processus Electron afin d'ouvrir la fenêtre normalement depuis les terminaux de développement.

Les tables et quelques données de départ sont créées automatiquement au premier démarrage, dans le schéma public. Les migrations suivantes conservent les données existantes. Le compte initial est `admin`, avec le mot de passe `POS_ADMIN_PASSWORD` ou `admin123` si cette variable n'est pas définie. Si le mot de passe de démonstration est utilisé, l'application impose son remplacement avant l'accès à la caisse. Les comptes créés et mots de passe réinitialisés par un administrateur doivent également être personnalisés à la connexion suivante. Un nouveau mot de passe doit comporter au moins 10 caractères. Modifier `POS_ADMIN_PASSWORD` après initialisation ne change pas un compte existant. Les mots de passe sont hachés avec scrypt et ne sont pas renvoyés à l'interface.

Le fichier `.env` est ignoré par Git et n'est pas inclus dans l'installateur. Pour une application installée, le placer dans le répertoire utilisateur Electron (`%APPDATA%/pos-lounge-bar/.env`), ou fournir son chemin via la variable d'environnement `POS_ENV_FILE`.

## Commandes et paiements

Chaque commande est réservée au caissier et au POS qui l’ont créée : un caissier ne peut la reprendre, la modifier, l’encaisser ou l’annuler que sur ce même poste. L’administrateur peut intervenir sur toutes les commandes sans changer leur propriétaire. Le contrôle est effectué dans les transactions PostgreSQL. L’identifiant du POS est conservé dans `pos-terminal-id` dans le répertoire utilisateur Electron ; ne pas copier ce fichier vers un autre poste. Les anciennes commandes sans identifiant de POS nécessitent l’intervention d’un administrateur.

Pour ajouter un catalogue de test après le premier démarrage : `npm run db:seed-demo`. Il comprend 8 catégories et 42 produits (boissons, bières, cocktails, boissons chaudes, entrées, plats, accompagnements, desserts), ainsi que 20 tables réparties entre Salle, Terrasse et Salon VIP. Les prix sont des exemples dans la devise configurée. La commande ajoute uniquement les entrées manquantes, conserve les données existantes et peut être relancée sans créer de doublons.

Les modifications du panier sont conservées immédiatement dans un brouillon sur cet appareil, puis enregistrées automatiquement dans PostgreSQL après 600 ms d'inactivité. L'état de sauvegarde est affiché. Le bouton « Enregistrer et revenir » attend la sauvegarde en base avant de revenir aux tables. En cas de panne, le brouillon est proposé à la prochaine ouverture de la même table sur cet appareil. Une fermeture normale avant la fin de sauvegarde demande confirmation. Cette protection ne remplace pas une sauvegarde externe de PostgreSQL.

Chaque commande porte une version : une caisse ne peut pas écraser une modification plus récente provenant d'une autre caisse. En cas de conflit, vérifier le panier puis choisir explicitement « Recharger la commande » pour utiliser la version en base ; cette action remplace le brouillon local. Les articles déjà enregistrés conservent leur nom et prix même si le catalogue change ou si le produit est désactivé. Les nouveaux articles utilisent les prix du catalogue côté serveur.

Le paiement valide les montants et enregistre articles, montant reçu, monnaie et libération de table dans une seule transaction. Une commande clôturée ne peut pas être payée une seconde fois. Si la réponse au paiement est perdue, l'application consulte l'état enregistré avant de proposer une nouvelle tentative. Une commande ouverte peut être annulée avec un motif : la table est libérée et l'annulation conservée dans le journal. Les prix utilisent des montants entiers dans la devise configurée. Une base représente une seule devise ; la devise n'est plus modifiable dès qu'une commande existe, afin de ne pas réinterpréter l'historique.

L'administration permet de créer et modifier utilisateurs, produits, catégories, tables et zones. Les comptes, produits et catégories sont désactivés plutôt qu'effacés ; une table peut être mise hors service. Les tables occupées ne peuvent pas être désactivées, ni leurs zones supprimées. Un administrateur ne peut pas désactiver ou rétrograder son propre compte et le dernier administrateur actif est protégé. Les sessions sont vérifiées côté serveur et révoquées après une désactivation ou une réinitialisation de mot de passe.

Les paramètres de l'établissement et le format 58/80 mm sont modifiables. Le journal montre les 100 dernières actions. « Ventes et reçus » propose une journée en heure locale, des statistiques et les reçus réimprimables. L'impression utilise un document dédié construit depuis les données encaissées, sans imprimer le reste de l'écran. Annuler ou échouer l'impression ne modifie jamais le paiement. Implémentation basée sur [webContents.print d'Electron](https://www.electronjs.org/docs/latest/api/web-contents#contentsprintoptions-callback).

Aucun stock, terminal bancaire, paiement électronique, tiroir-caisse ou pilote ESC/POS n'est intégré. L'imprimante thermique et son pilote Windows doivent être vérifiés sur le matériel réel.

## Sauvegarder et restaurer

Une sauvegarde PostgreSQL au format personnalisé (`.dump`) est créée quotidiennement dans `%APPDATA%/pos-lounge-bar/backups`, au démarrage ou lors de la vérification horaire si l'application reste ouverte. L'administration affiche le dernier fichier et les erreurs éventuelles. Elle permet aussi de choisir un emplacement pour une sauvegarde manuelle. Les sauvegardes ne sont pas supprimées automatiquement : surveiller l'espace disponible et conserver une copie sur un disque externe ou un autre équipement.

Les outils `pg_dump` et `pg_restore` de PostgreSQL doivent être présents. Sous Windows, l'application recherche leur installation dans `C:/Program Files/PostgreSQL`; un chemin personnalisé peut être configuré avec `PG_DUMP_PATH` et `PG_RESTORE_PATH`. Les identifiants sont transmis au processus de sauvegarde par son environnement, sans mot de passe dans la ligne de commande. Le fichier `.partial` n'est renommé en `.dump` qu'après réussite.

Pour restaurer, créer une **base vide distincte** (par exemple `pos_recovery`), puis définir `RESTORE_DATABASE_URL` vers cette base et lancer :

```powershell
npm.cmd run db:restore -- "E:\Sauvegardes\pos-backup.dump"
```

La restauration refuse de cibler la base active ou une base contenant déjà des tables et s'exécute en une transaction. Après vérification des données restaurées, modifier `DATABASE_URL` manuellement pour choisir la nouvelle base. Ne jamais placer un fichier `.dump` dans un répertoire public : il contient les données du commerce et les empreintes des mots de passe.

## Vérification

- `npm run typecheck`
- `npm run lint`
- `npm run build:web`
- `npm run test:drafts` : récupération des brouillons, sauvegardes concurrentes, panne et conflits.
- `npm run test:postgres` : initialise le schéma si nécessaire, crée des données temporaires identifiées, vérifie les droits IPC, sessions, administration, commandes, calculs, transactions, persistance, reçus et sauvegardes. Il restaure un `.dump` dans une base de test temporaire puis supprime ses données et cette base ; ce test nécessite le droit PostgreSQL `CREATEDB`.
- `npm run test:electron` : parcours réel dans une fenêtre Electron masquée, avec des données temporaires identifiées : connexion, table, panier, paiement, reçu et ajout d'un produit. PostgreSQL et la version compilée du schéma doivent être disponibles. Exécuter d'abord `test:postgres` sur une nouvelle installation.

La connexion a été déplacée de SQLite/Supabase vers PostgreSQL. Les anciennes données SQLite ou Supabase ne sont pas importées automatiquement.
# pos_loungebar
