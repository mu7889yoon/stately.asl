# stately (MVP)

TypeScriptで記述されたAWS Lambda相当の関数から、Amazon States Language (ASL) を出力するトランスパイラ（MVP）。

- 対象: AWS SDK v3 の DynamoDB 呼び出し（`client.send(new XxxCommand(...))`）
- 構文対応（MVP）:
  - 直列の `await` → 直列 Task
  - `Promise.all([...])` → Parallel
  - `for/of` → Map
  - `try/catch` → （MVPではTry内を展開、将来Catch/Retry強化）

## インストール / ビルド

```bash
yarn install
yarn build
yarn test
```

## CLI

```bash
# 解析（Phase1）
node packages/cli/dist/index.js analyze examples/ddb-put-item.ts

# 変換（Phase2）: ASLを標準出力
yarn build && node packages/cli/dist/index.js transpile examples/ddb-put-item.ts --pretty

# ファイルへ出力
yarn build && node packages/cli/dist/index.js transpile examples/ddb-put-item.ts --out asl.json --pretty

# 生成ASLの検証（aws CLI が必要）
yarn build && node packages/cli/dist/index.js transpile examples/ddb-put-item.ts --pretty --validate
```

- `--validate`: `aws stepfunctions validate-state-machine --definition file://...` を内部実行します。AWS CLIのセットアップが必要です。

## 制約（MVP）
- 対応サービスは DynamoDB のみ
- 外部I/O（axios, fs等）、動的import、eval、再帰、無限ループなどは解析エラー
- パラメータのマッピングは `{"Key.$": "$.Key"}` の規約で生成

## 開発
- ワークスペース: `packages/*`, `examples`, `test`
- コア: `packages/core`（AST→IR→ASL）
- プラグイン: `packages/plugins`（DDBマッピング）
- ランタイム: `packages/runtime`（Retry/Catchプリセット）
- 型: `packages/types`