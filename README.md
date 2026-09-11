# RAT WebAuthn Demo

RATの勉強会に向けた、WebAuthnによる公開鍵の登録・認証応答の検証を学ぶためのデモです。
ブラウザと認証器、Node.jsサーバー、SQLiteの役割を確認できます。

**ローカル学習用です。本番の認証基盤として、そのまま利用・公開しないでください。**

## できること

- ユーザーを作成し、Passkey（Credential）を登録する
- Credential ID・公開鍵・counterなどをSQLiteへ保存する
- challenge・origin・RP ID・署名などをSimpleWebAuthnで検証する
- デバッグログで登録・認証の各段階を観察する

認証成功時はAPIが `verified: true` を返します。ログインセッションや権限管理は実装していません。
秘密鍵やWindows HelloのPIN・生体情報を、このサーバーへ保存する仕組みではありません。

## 必要な環境

- Node.js 22以上（現在のbetter-sqlite3の要件）
- npm
- WebAuthn対応ブラウザ
- Windows Helloやセキュリティキーなど、ブラウザから利用できる認証器

## セットアップと起動

プロジェクトのディレクトリで、順番に実行します。

```powershell
npm ci
npm run build
npm start
```

ブラウザで `http://localhost:3000` を開きます。
RP IDは `localhost`、期待するoriginは `http://localhost:3000` に固定されています。
IPアドレスや別のホスト名に置き換えず、このURLを使用してください。

`webauthn.db` はサーバー起動時に作成されます。既存のDBがある場合は、そのデータを使用します。
サーバーはプロジェクトのディレクトリから起動してください。

## デモの手順

1. サーバーを起動した状態で、別のPowerShellからデモユーザーを作成します。

   ```powershell
   Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/users' -ContentType 'application/json' -Body '{"username":"demo-user"}'
   ```

2. ブラウザのユーザー名欄を `demo-user` に変更します。
3. 「Passkey登録」を押し、認証器の確認操作を行います。
4. 「Passkeyログイン」を押し、認証器の確認操作を行います。
5. 画面の成功表示とサーバーのログを確認します。

画面にはユーザー作成ボタンがないため、先にAPIで作成する必要があります。
登録済みのCredentialを除外する設定があるため、同じ認証器への再登録が拒否される場合があります。

### 詳細ログを表示する

通常起動中のサーバーをCtrl+Cで停止してから、PowerShellで実行します。

```powershell
$env:WEBAUTHN_DEBUG = '1'
npm start
```

詳細ログには、challenge、Credential ID、公開鍵、認証応答などが含まれます。
デモ用データで使用し、実際の利用者のログやスクリーンショットをリポジトリへ含めないでください。
ブラウザの開発者ツールにも認証関連データを出力しています。

詳細ログを無効に戻す場合は、停止後に次を実行して再起動します。

```powershell
Remove-Item Env:WEBAUTHN_DEBUG -ErrorAction SilentlyContinue
npm start
```

ログ内でデータをデコードして表示する処理と、認証応答の検証は別です。
検証結果の判定にはSimpleWebAuthnの検証関数を使用しています。

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| server.js | Express API、challengeの保持、検証とDB保存 |
| database.js | SQLite接続とテーブル作成 |
| client.js | ブラウザ側の登録・認証処理 |
| public/main.js | esbuildで生成するブラウザ用JavaScript |
| public/index.html | デモ画面 |
| webauthn-debug.js | 発表用のデコード表示・詳細ログ |
| package-lock.json | 依存関係のバージョンを固定 |

`client.js` を編集したら、`npm run build` を再実行してください。
`public/main.js` は生成物なので直接編集しません。

## 現在の制約

- **登録権限の確認がありません。** ユーザー名を指定するだけで、そのユーザーに新しい鍵を登録できる構成です。認証器での本人確認は、既存アカウントへの鍵追加権限を保証しません。
- challengeはメモリ上のMapに保存し、有効期限を設けていません。同じユーザーの同時操作で上書きされ、検証前の原子的な一回消費も実装していません。
- セッション、認可、Credentialの失効、紛失復旧を実装していません。
- 入力検証、レート制限、エラー情報の公開範囲などは、本番運用に向けた整備が必要です。
- `app.listen(PORT)` はlocalhostへの待ち受けに限定していません。ポート転送や外部公開をせず、ローカルの検証環境で使用してください。
- `npm test` は未設定のひな形で、実行すると失敗します。自動テストが揃ったプロジェクトではありません。

## Gitで管理するもの

ソースコード、`package.json`、`package-lock.json`、このREADMEを管理します。
`.gitignore` で以下を除外しています。

- `node_modules/`
- `webauthn.db` などのSQLiteデータとジャーナルファイル
- `.env` などのローカル設定（`.env.example` は除外しません）
- ログファイル

DBにはユーザー名やCredential情報が入るため、公開用のサンプルとしても実データを含めないでください。
`.gitignore` は、すでにコミットしたファイルや履歴からデータを削除するものではありません。
