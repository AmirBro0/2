# Ресурсы интерфейса

Все ресурсы интерфейса поставляются вместе с проектом в `app/static/` и раздаются через `/static/`. Git-клон, Download ZIP и Docker включают один и тот же набор. Minecraft не требуется для запуска.

| Ресурсы | Путь | Происхождение |
| --- | --- | --- |
| Панорама входа, шесть сторон | `minecraft-local/panorama_*.png` | Ранее извлечены из установленного Minecraft скриптом `extract_local_panorama.py`. |
| Фон инвентаря | `minecraft-local/inventory/world_reference.png` | Игровой скриншот, предоставленный пользователем. |
| Фон Энда | `minecraft-local/inventory/end_world.jpg` | Скриншот Minecraft; исходный URL сохранён в `scripts/fetch_end_background.py`. |
| Предметы | `minecraft-local/inventory/items/` | Minecraft Item Gallery; исходные URL, размеры и SHA-256 сохранены в `sources.json` рядом с PNG. |
| Инвентарь, справочник, HUD и игровые текстуры | `minecraft-local/inventory/` | Ранее извлечены из Minecraft. Соответствие исходных путей сохранено в `scripts/extract_local_inventory_assets.py`. |
| Шрифт, кириллица и bitmap-символы | `minecraft-local/font/` | Игровые атласы и карта глифов; TTF построен `scripts/build_local_minecraft_font.py`. |
| Звуки, кнопки, полоса опыта | `minecraft-local/ui/` | Ранее извлечены `scripts/extract_local_ui_assets.py`. |
| Фиолетовый персонаж DS | `character-art.png` | Референс пользователя; модель собирается в `avatar.js`. |

Minecraft и оригинальные игровые материалы принадлежат Mojang / Microsoft. Проект не является официальным продуктом Minecraft. Это описание происхождения ресурсов, а не отдельная лицензия на них.

Скрипты извлечения и скачивания нужны только при замене ресурсов. Обычный запуск не обращается к установленной игре, Downloads, CDN или исходным сайтам. При добавлении новых изображений используйте относительный путь внутри `app/static/` и добавляйте сами файлы в Git.
