# Typing Expand

Extension SillyTavern : quand vous écrivez dans `#send_textarea`, les boutons à gauche de la barre de saisie (menu, baguette magique, pièce jointe, avatar...) se réduisent à largeur 0 avec une transition douce, et le champ de texte s'étend sur toute la largeur. Par défaut, ils sont cachés dès le premier caractère et reviennent **immédiatement dès que le champ est vide** (même si le champ garde le focus et le clavier reste ouvert), ou après l'envoi.

> ⚠️ **Non testée dans un vrai SillyTavern** : seuls la logique de détection et les scénarios focus/blur/effacement/envoi sont testés sous Node + jsdom (`npm install jsdom@24` puis `node test/typing-expand.test.mjs`).

## Installation

SillyTavern > Extensions > **Install extension** > coller `https://github.com/hydravnss/typing-expand`.
Réglages : Extensions > **Typing Expand**.

## Réglages

- Activer / désactiver.
- **Garder cachés tant qu'il y a du texte** (défaut : oui) ; sinon cachés seulement quand il y a du texte ET que le champ a le focus.
- **Cacher dès le focus** (défaut : non) : par défaut les boutons ne se cachent qu'au premier caractère tapé (un champ vide avec focus affiche les boutons normaux). Activé : ils se cachent dès le focus ; quand le texte est effacé (même champ toujours focus) ils reviennent, et ne se re-cachent qu'à la prochaine saisie de texte.
- **Détecter automatiquement** (défaut : oui) : tout élément placé avant la zone de saisie dans `#send_form` (à chaque niveau) reçoit la classe `te-hide-left`. Utile avec un thème personnalisé (avatar, boutons ajoutés).
- **Sélecteurs CSS à cacher** (un par ligne) : `#leftSendForm`, `#options_button`, `#extensionsMenuButton` par défaut.
- Sélecteurs à ne jamais cacher (détection auto) : `#qr--bar`, `#file_form` par défaut.
- Durée de la transition : 0-500 ms (défaut 150).
- **Petite flèche « › »** pour ré-afficher temporairement les boutons (défaut : oui).
- Seulement sur petit écran (<= 1000px) (défaut : non).

## iOS / détection du texte vide

Safari iOS ne déclenche pas toujours `input` (effacement, couper, dictée, correction automatique) et `textarea.value = ''` (après envoi) ne déclenche aucun événement. L'extension écoute donc `input`, `keyup`, `change`, `cut`, `paste` et `compositionend`, et compare en plus `textarea.value.trim().length` à l'état toutes les 250 ms (poll léger). Les boutons reviennent dès que le champ est vide.

## Historique

- **1.0.1** : correctif iPhone (les boutons ne revenaient pas après avoir tout effacé, clavier ouvert) ; nouveau réglage « Cacher dès le focus » ; poll 250 ms + événements supplémentaires.
- **1.0.0** : version initiale.

## Compatibilité avec un thème CSS personnalisé

Les règles sont injectées dans `<style id="typing-expand-style">` (gardé en dernier dans `<head>`) avec `!important` et une spécificité élevée, pour l'emporter sur un thème comme « iMessage Dark ». Seuls les éléments de gauche sont cachés : le bouton d'envoi reste en place, et un délai de 80 ms au blur évite qu'un tap sur « envoyer » soit perdu sur iOS.

## Licence

MIT
