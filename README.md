# Typing Expand

Extension SillyTavern : quand vous écrivez dans `#send_textarea`, les boutons à gauche de la barre de saisie (menu, baguette magique, pièce jointe, avatar...) se réduisent à largeur 0 avec une transition douce, et le champ de texte s'étend sur toute la largeur. Ils reviennent quand le champ perd le focus **et** est vide (ou après l'envoi).

> ⚠️ **Non testée dans un vrai SillyTavern** : seuls la logique de détection et un scénario focus/blur sont testés sous Node + jsdom (`npm install jsdom@24` puis `node test/typing-expand.test.mjs`).

## Installation

SillyTavern > Extensions > **Install extension** > coller `https://github.com/hydravnss/typing-expand`.
Réglages : Extensions > **Typing Expand**.

## Réglages

- Activer / désactiver.
- **Garder cachés tant qu'il y a du texte** (défaut : oui) ou seulement pendant le focus.
- **Détecter automatiquement** (défaut : oui) : tout élément placé avant la zone de saisie dans `#send_form` (à chaque niveau) reçoit la classe `te-hide-left`. Utile avec un thème personnalisé (avatar, boutons ajoutés).
- **Sélecteurs CSS à cacher** (un par ligne) : `#leftSendForm`, `#options_button`, `#extensionsMenuButton` par défaut.
- Sélecteurs à ne jamais cacher (détection auto) : `#qr--bar`, `#file_form` par défaut.
- Durée de la transition : 0-500 ms (défaut 150).
- **Petite flèche « › »** pour ré-afficher temporairement les boutons (défaut : oui).
- Seulement sur petit écran (<= 1000px) (défaut : non).

## Compatibilité avec un thème CSS personnalisé

Les règles sont injectées dans `<style id="typing-expand-style">` (gardé en dernier dans `<head>`) avec `!important` et une spécificité élevée, pour l'emporter sur un thème comme « iMessage Dark ». Seuls les éléments de gauche sont cachés : le bouton d'envoi reste en place, et un délai de 80 ms au blur évite qu'un tap sur « envoyer » soit perdu sur iOS.

## Licence

MIT
