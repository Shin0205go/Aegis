# AEGIS - AI Data Guardian 🛡️

> ⚠️ **Status: Experimental / PoC**
>
> **Model Context Protocol (MCP)** を活用した、AI向けデータ保護ファイアウォールの実験実装です。
> コンセプト実証用のため、本番環境での利用は推奨されません。

![Status](https://img.shields.io/badge/Status-Experimental%20PoC-orange) ![License](https://img.shields.io/badge/License-MIT-blue)

**Aegis（イージス）**は、AIエージェントとあなたのデータの間に立ち、情報の流出を防ぐ「盾」です。
「給与は見せない」「GPSは曖昧にする」といった**自然言語のルール**に基づいて、AIへのデータ提供を動的に制御します。

## 🏗️ 仕組み (Architecture)

TBD

## ✨ 特徴
• 🗣️ 言葉でルール記述: 「個人情報は隠して」「要約だけ渡して」など、自然言語でポリシーを設定可能。
• 🧠 AIによる検閲: ルールに基づいて、AIがリクエスト内容を動的に判定・マスキングします。
• 🔌 MCP対応: Claude DesktopなどのMCP対応クライアントでそのまま利用可能。
## 🚀 クイックスタート
### 1. インストール & ビルド
```
git clone [https://github.com/Shin0205go/Aegis.git](https://github.com/Shin0205go/Aegis.git)
cd Aegis
npm install && npm run build
```

### 2. 環境設定
APIキー（Anthropic または OpenAI）を設定します。
```bash
cp .env.example .env
# .env内の API_KEY を書き換えてください
```

### 3. 起動
**Claude Desktop で使う場合 (stdioモード):**
```bash
node scripts/mcp-launcher.js stdio
```

**Webアプリ等から使う場合 (HTTPモード):**
```bash
node scripts/mcp-launcher.js
# Server running on port 3000
```

## 🧪 テスト
MCP Inspectorを使って挙動を確認できます。
```bash
./test/mcp-inspector/test-with-inspector.sh
```

## 📄 ライセンス
MIT License

---
**Built by Shingo Matsuo**

