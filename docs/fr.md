# Redmine

Les demandes de votre [Redmine](https://www.redmine.org) dans Gladys : combien
sont ouvertes, assignées à vous, en retard, à échéance aujourd'hui, mises à jour
aujourd'hui. Une scène réagit à une nouvelle demande, à une demande qui vous est
assignée, à une demande qui passe en retard ou à une demande fermée, et Gladys
peut **créer une demande d'elle-même** quand elle détecte quelque chose à faire :
une fuite d'eau, un filtre à changer, une imprimante qui ne répond plus.

> **Vos retours sont les bienvenus.** Cette intégration a été testée contre un
> vrai Redmine (l'image Docker officielle `redmine` 6.1, octobre 2026), pas encore
> au quotidien sur un vrai suivi. Si quelque chose ne marche pas comme décrit,
> dites-le sur le [forum de Gladys](https://community.gladysassistant.com) ou dans
> les [issues](https://github.com/guim31/gladys-redmine/issues).

## Ce qu'il faut

- Gladys Assistant 5.1.0 ou plus récent.
- **Redmine 4.2 ou plus récent**, auto-hébergé ou hébergé (Planio, un serveur à
  vous sur Internet), joignable depuis Gladys.
- Un **utilisateur Redmine** au nom duquel Gladys lit et crée les demandes : le
  vôtre, ou un utilisateur créé pour elle (`gladys`), membre des projets à suivre
  avec un rôle qui peut voir, créer des demandes et ajouter des notes (le rôle
  **Développeur** par défaut le peut). L'intégration voit exactement ce que cet
  utilisateur voit dans Redmine.

## Installation

### Dans Redmine

1. **Administration** → **Configuration** → onglet **API** : cochez **Activer
   l'API REST**, puis enregistrez.
2. Connecté en tant qu'utilisateur de Gladys, ouvrez **Mon compte** et, dans la
   colonne de droite, sous **Clé d'accès API**, cliquez sur **Afficher** :
   copiez la clé.

### Dans Gladys

1. **Intégrations** → installez **Redmine**.
2. Dans l'écran **Configuration**, renseignez :
   - **Adresse** : l'adresse de Redmine comme dans le navigateur, ex.
     `https://redmine.example.org` ou `http://192.168.1.30:3000` (un dossier
     `/redmine` est gardé, `/issues/…` ou `/projects/…` sont retirés) ;
   - **Clé d'API** : la clé copiée à l'étape 2 ;
   - **Projets avec leur propre appareil** (facultatif) : identifiants ou noms de
     projets, séparés par des virgules, ex. `maison, bureau` (10 au plus) ;
   - **Accepter les certificats auto-signés** : pour un Redmine en `https://`
     avec un certificat auto-signé ;
   - **Intervalle de rafraîchissement** : 1, 2, 5 (par défaut) ou 10 minutes ;
   - **Langue des noms de fonctionnalités** : la langue des noms donnés aux
     fonctionnalités des appareils.
3. **Tester la connexion** indique l'utilisateur et le nombre de demandes
   ouvertes, qui lui sont assignées et en retard, et nomme les projets
   introuvables.
4. Onglet **Découverte** : ajoutez l'appareil **Redmine**, et celui de chaque
   projet suivi (**Redmine Maison**, par exemple).

## Appareils

Un appareil **Redmine** pour toutes les demandes que voit l'utilisateur, et un
appareil par projet suivi, avec cinq compteurs mis à jour à chaque lecture :

| Fonctionnalité                    | Ce qu'elle compte                                                     |
| --------------------------------- | --------------------------------------------------------------------- |
| Demandes ouvertes                 | demandes dont le statut n'est pas fermé                               |
| Demandes assignées à moi          | demandes ouvertes assignées à l'utilisateur, ou à l'un de ses groupes |
| Demandes en retard                | demandes ouvertes dont l'échéance est passée                          |
| Demandes à échéance aujourd'hui   | demandes ouvertes dont l'échéance est aujourd'hui                     |
| Demandes mises à jour aujourd'hui | demandes modifiées depuis minuit, ouvertes ou fermées                 |

« Aujourd'hui » est le jour dans le fuseau horaire de Gladys. Une demande sans
échéance n'est jamais en retard. Les compteurs gardent leur historique et servent
de conditions dans les scènes (« si Demandes en retard est supérieur à 0 »). Un
appareil de projet ne compte que les demandes de ce projet, pas celles de ses
sous-projets.

## Tableau de bord

Le widget **Mes demandes Redmine** affiche trois tuiles (assignées à moi, en
retard, pour aujourd'hui) et les huit demandes ouvertes les plus pressantes
assignées à l'utilisateur : celles en retard d'abord (pastille rouge « En
retard »), puis celles à échéance aujourd'hui (pastille orange « Aujourd'hui »),
puis par échéance. Chaque ligne donne le projet, le statut et la priorité. Quand
Redmine est en `https://`, chaque demande propose un lien **Ouvrir dans Redmine**.

## Scènes

### Déclencheurs

Les quatre déclencheurs filtrent par **Nom du projet**, **Tracker** et
**Priorité**, écrits comme dans Redmine (majuscules comprises ; vide : tous).

- **Nouvelle demande Redmine** : une demande a été créée dans Redmine, par un
  utilisateur, par e-mail ou par un autre outil. Les demandes créées par Gladys
  elle-même ne déclenchent rien (pas de boucle).
- **Demande Redmine assignée à moi** : une demande ouverte est maintenant
  assignée à l'utilisateur de la clé (ou à l'un de ses groupes) : créée ainsi, ou
  réassignée.
- **Demande Redmine en retard** : une demande ouverte vient de dépasser son
  échéance. Vérifié à chaque lecture : la première lecture après minuit le
  déclenche pour les demandes à échéance la veille.
- **Demande Redmine fermée** : une demande ouverte à la lecture précédente a
  maintenant un statut fermé (Fermé, Rejeté…).

Variables transmises aux actions : numéro de la demande, sujet, projet, tracker,
statut, priorité, auteur, assignée à, échéance et lien vers la demande. Les noms
sont ceux qu'affiche Redmine, dans sa langue.

Les événements sont détectés à chaque lecture : ils arrivent au plus un intervalle
de rafraîchissement après les faits. À la toute première lecture (ou après un
changement de serveur ou d'utilisateur), l'intégration prend note de l'existant
sans rien déclencher. Une lecture déclenche 30 événements au plus (un import en
masse n'inonde pas Gladys).

### Actions

- **Créer une demande Redmine** : crée une demande au nom de l'utilisateur de la
  clé, qui en est l'auteur. Champs : **Projet** (identifiant, nom ou numéro,
  obligatoire), **Sujet** (obligatoire), **Description** (facultative ; les
  variables de scène sont bienvenues), **Priorité** (nom, vide : celle par
  défaut), **Tracker** (nom, vide : le premier du projet) et **M'assigner la
  demande**. Sorties : le numéro de la demande et son lien.
- **Ajouter une note à une demande Redmine** : ajoute une note à la demande
  donnée par son numéro (`125` ou `#125`), au nom de l'utilisateur de la clé. Le
  numéro peut venir d'un « Créer une demande Redmine » plus tôt dans la scène, ou
  du déclencheur. Sorties : le numéro et le sujet de la demande.

Un projet, une priorité ou un tracker se donne par son numéro ou son nom, sans
tenir compte des majuscules ni des accents ; un projet aussi par son identifiant
(`maison`).

### Idées de scènes

- **Fuite d'eau** : le détecteur de fuite de la cave signale une fuite → **Créer
  une demande Redmine** « Fuite d'eau à la cave » dans le projet `maison`,
  priorité Urgent, assignée à moi, description avec l'heure ; puis un message
  Gladys avec le lien vers la demande.
- **Point du matin** : chaque jour de semaine à 8 h, si **Demandes à échéance
  aujourd'hui** de l'appareil Redmine est supérieur à 0, Gladys annonce combien de
  demandes arrivent à échéance aujourd'hui.
- **Astreinte** : **Nouvelle demande Redmine** filtrée sur la priorité Immédiat →
  un message Telegram avec le sujet, l'auteur et le lien ; **Demande Redmine en
  retard** → la lampe du bureau passe au rouge ; **Demande Redmine fermée** →
  retour au blanc.

## Dépannage

- **« aucune API Redmine à cette adresse »** : vérifiez l'adresse (avec le
  dossier `/redmine` s'il y en a un) en ouvrant `…/issues.json` dans un
  navigateur : Redmine répond en JSON.
- **« l'API REST est désactivée »** : voir l'étape 1 dans Redmine. API coupée,
  Redmine ignore la clé et ne montrerait que les projets publics : l'intégration
  le vérifie d'abord.
- **« clé d'API refusée »** : la clé a été réinitialisée depuis (Mon compte,
  Réinitialiser), ou l'utilisateur est verrouillé.
- **« l'utilisateur Redmine n'a pas la permission nécessaire dans ce projet »** :
  son rôle dans le projet ne permet pas de créer des demandes ou d'ajouter des
  notes.
- **« Projets introuvables »** (Tester la connexion) : l'utilisateur n'est pas
  membre du projet, ou l'identifiant est mal écrit.
- **Les compteurs restent à zéro** : l'utilisateur n'est membre d'aucun projet, ou
  son rôle ne permet pas de voir les demandes.

## Limites

- Un Redmine par installation, 10 projets suivis au plus.
- Les 1 000 demandes ouvertes les plus récentes sont détaillées (en retard, à
  échéance aujourd'hui, appareils de projet) ; au-delà, les compteurs « Demandes
  ouvertes » et « Demandes assignées à moi » restent exacts.
- Un sous-projet n'est pas compté dans l'appareil de son parent : suivez-le comme
  un projet.
- Une demande créée puis fermée entre deux lectures déclenche « Nouvelle demande
  Redmine » mais pas « fermée ».
- Les champs personnalisés, le temps passé et les versions ne sont pas lus.

Cette intégration n'est pas affiliée à Redmine ni à ses auteurs.
