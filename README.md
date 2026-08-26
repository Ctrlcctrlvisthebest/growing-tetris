# Growing Tetris

一个会在下落过程中不断生长的俄罗斯方块网页游戏。

## 本地预览

在项目目录启动任意静态文件服务器，例如：

```bash
python3 -m http.server 8000
```

然后访问 `http://localhost:8000`。

## 发布到 GitHub Pages

1. 将整个项目推送到 GitHub 仓库。
2. 打开仓库的 **Settings → Pages**。
3. 在 **Build and deployment** 中选择 **Deploy from a branch**。
4. 选择 `main` 分支和 `/ (root)` 文件夹并保存。

## 操作

- `←` / `→`：移动
- `↑`：顺时针旋转
- `Z`：逆时针旋转
- `X`：旋转 180°
- `↓`：加速下落
- `Space`：直接落下
- `C`：存储或交换方块；每回合只能使用一次
- `H`：切换普通/困难模式并重新开局
- `R`：重新开始

困难模式中，第一次操作显示下一次生长位置，第二次操作让该位置生长；之后重复这一循环。
