# Transfert : application Flower Power → `0xbulma/plant-tool`

Ce dossier est un **point de passage temporaire**. Il contient `plant-tool.bundle`,
un *git bundle* avec l'historique complet (3 commits) de l'app web qui lit le
capteur de plantes Parrot Flower Power (React 19 + Vite 8 + Tailwind v4 +
shadcn/ui + Vitest 4 ; 27 tests verts, build OK, 0 vulnérabilité).

Il a été déposé ici parce que la session d'origine était une sandbox éphémère
sans accès en écriture au repo `0xbulma/plant-tool`. N'importe quelle session
ayant accès à `plant-tool` peut publier le code ainsi :

```bash
# 1. récupérer ce dossier
git fetch origin claude/0xbulma-private-repo-fi7gnb
git checkout claude/0xbulma-private-repo-fi7gnb -- plant-tool-transfer/plant-tool.bundle

# 2. cloner depuis le bundle et publier vers le vrai repo
git clone plant-tool-transfer/plant-tool.bundle /tmp/plant-tool
cd /tmp/plant-tool
git remote set-url origin https://github.com/0xbulma/plant-tool.git   # ou l'URL proxy de la session
git push -u origin main
```

Une fois le code publié sur `0xbulma/plant-tool`, ce dossier peut être supprimé
(la branche de transfert n'est pas destinée à être mergée dans `main`).
