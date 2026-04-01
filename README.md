# stately

TypeScriptで記述されたAWS SDK呼び出しを含む関数から、Amazon States Language (ASL) を自動生成するトランスパイラです。

AWS Step Functionsのワークフローを、慣れ親しんだTypeScriptの構文で記述できます。

`await`、`Promise.all`、`for...of`、`if/else`、`try/catch`といった標準的なTypeScript構文が、対応するASLの状態（Task、Parallel、Map、Choice、Catch）に変換されます。AWS SDK v3 に加えて、`https` / `fetch` ベースの HTTP 呼び出しも Step Functions の HTTP Task に変換できます。

## 特徴

- TypeScriptの直感的な構文でStep Functionsワークフローを記述
- AWS SDK v3の呼び出しを自動的にASLのTask状態に変換
- 型安全な開発体験


## インストール

### ローカル開発

```bash
# リポジトリをクローン
git clone <repository-url>
cd stately

# 依存関係のインストール
yarn install

# ビルド
yarn build

# テスト実行
yarn test
```

### グローバルコマンドとして使用（npm link）

ビルド後、`npm link`でグローバルコマンドとして登録できます：

```bash
# ビルド
yarn build

# グローバルに登録
npm link

# どこからでも使用可能に
stately --version
stately transpile <file.ts>
```


## クイックスタート

### 基本的な使い方

```bash
# TypeScriptファイルをASLに変換
stately transpile handler.ts

# 整形して出力
stately transpile handler.ts --pretty

# ファイルに出力
stately transpile handler.ts --out workflow.asl.json --pretty

# AWS CLIで生成されたASLを検証
stately transpile handler.ts --pretty --validate
```

### CLIオプション

| オプション | 説明 |
|-----------|------|
| `-o, --out <path>` | 出力ファイルパス |
| `-f, --function <name>` | ターゲット関数名（複数関数がある場合） |
| `-p, --pretty` | JSONを整形出力 |
| `--no-retry` | デフォルトのRetry設定を無効化 |
| `--validate` | AWS CLIでASLを検証（aws CLIが必要） |
| `--ir` | ASLの代わりに中間表現（IR）を出力 |

### 解析コマンド

```bash
# ファイルの解析結果を表示
stately analyze handler.ts
```

## 使用例

### 入力（TypeScript）

```typescript
import { DynamoDBClient, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";

export async function handler(TableName: string, Key: Record<string, any>, Item: Record<string, any>) {
  const client = new DynamoDBClient({});

  // アイテムを保存
  await client.send(new PutItemCommand({ TableName, Item }));

  // アイテムを取得
  const result = await client.send(new GetItemCommand({ TableName, Key }));

  return result;
}
```

### 出力（ASL）

```json
{
  "StartAt": "putItem_1",
  "States": {
    "putItem_1": {
      "Type": "Task",
      "Resource": "arn:aws:states:::aws-sdk:dynamodb:putItem",
      "Parameters": {
        "TableName.$": "$.TableName",
        "Item.$": "$.Item"
      },
      "ResultPath": "$.putItem_1Result",
      "Retry": [
        {
          "ErrorEquals": ["States.ALL"],
          "IntervalSeconds": 2,
          "MaxAttempts": 3,
          "BackoffRate": 2
        }
      ],
      "Next": "getItem_2"
    },
    "getItem_2": {
      "Type": "Task",
      "Resource": "arn:aws:states:::aws-sdk:dynamodb:getItem",
      "Parameters": {
        "TableName.$": "$.TableName",
        "Key.$": "$.Key"
      },
      "ResultPath": "$.getItem_2Result",
      "Retry": [
        {
          "ErrorEquals": ["States.ALL"],
          "IntervalSeconds": 2,
          "MaxAttempts": 3,
          "BackoffRate": 2
        }
      ],
      "End": true
    }
  }
}
```


## 対応サービス

現在、以下のAWSサービスのSDK呼び出しをサポートしています：

| サービス | 対応オペレーション |
|---------|-------------------|
| DynamoDB | PutItem, GetItem, UpdateItem, DeleteItem, Query, Scan, BatchWriteItem, BatchGetItem |
| S3 | GetObject, PutObject, DeleteObject, CopyObject, ListObjectsV2 |
| SQS | SendMessage, ReceiveMessage, DeleteMessage |
| SNS | Publish |
| HTTP | `https.get`, `https.request`, `fetch(url, init)` |

## 対応構文

TypeScriptの構文がASLの状態に以下のようにマッピングされます：

| TypeScript構文 | ASL状態 | 説明 |
|---------------|---------|------|
| `await` (直列) | Task | SDK呼び出しを順次実行 |
| `Promise.all([...])` | Parallel | 複数の操作を並列実行 |
| `for...of` | Map | 配列の各要素に対して処理を実行 |
| `if/else` | Choice | 条件分岐 |
| `try/catch` | Catch | エラーハンドリング |

### 並列処理の例

```typescript
// Promise.all → Parallel状態
const results = await Promise.all([
  client.send(new GetItemCommand({ TableName, Key: key1 })),
  client.send(new GetItemCommand({ TableName, Key: key2 })),
]);
```

### ループ処理の例

```typescript
// for...of → Map状態
for (const item of items) {
  await client.send(new PutItemCommand({ TableName, Item: item }));
}
```

### エラーハンドリングの例

```typescript
// try/catch → Catch設定
try {
  await client.send(new PutItemCommand({ TableName, Item }));
} catch (error) {
  return { success: false, error: "Failed" };
}
```

### HTTP呼び出しの例

```typescript
// fetch → HTTP Task
await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: payload,
});
```


## プログラマティックAPI

CLIを使わず、コードから直接statelyを使用できます。

### transpile関数

TypeScriptファイルをASLに変換します。

```typescript
import { transpile } from 'stately';

const result = await transpile({
  entry: 'src/handler.ts',      // 入力ファイルパス
  functionName: 'handler',       // ターゲット関数名（オプション）
  includeRetry: true,            // Retry設定を含める（デフォルト: true）
});

// 結果
console.log(result.asl);         // ASL State Machine
console.log(result.ir);          // 中間表現
console.log(result.diagnostics); // 警告・エラー
```

### analyze関数

TypeScriptファイルを解析し、Step Functions互換性をチェックします。

```typescript
import { analyze } from 'stately';

const result = await analyze({
  entry: 'src/handler.ts',
  functionName: 'handler',  // オプション
});

console.log(result.ok);          // 解析成功かどうか
console.log(result.diagnostics); // 警告・エラー
console.log(result.metrics);     // メトリクス（SDK呼び出し数など）
```

### 型定義

主要な型はすべてエクスポートされています：

```typescript
import type {
  TranspileOptions,
  TranspileResult,
  ASLStateMachine,
  IR,
  Diagnostic,
} from 'stately';
```


## 制約事項

statelyはStep Functionsの制約に合わせて設計されているため、以下の構文・機能は使用できません：

### 使用できない構文

- 外部I/O（axios, fs等）- AWS SDKとHTTP Taskに変換できる `https` / `fetch` のみサポート
- 動的import（`import()`）
- `eval`、`new Function()`
- 再帰関数呼び出し
- 無限ループ（`while(true)`等）
- クロージャによる外部変数のキャプチャ

### パラメータの制約

- パラメータは `{"Key.$": "$.Key"}` 形式（JSONPath）で生成されます
- 複雑な式や計算はサポートされていません
- リテラル値は直接埋め込まれます
- `fetch` は `fetch(url)` と `fetch(url, { method, headers, body })` の基本形をサポートします
- `fetch(...).json()` は `return await (await fetch(...)).json()` のような終端の直結形のみサポートします

### サポート外のAWSサービス

現在、DynamoDB、S3、SQS、SNS以外のAWSサービスはサポートされていません。

## 開発

```bash
# ビルド
yarn build

# テスト
yarn test

# ウォッチモード
yarn dev

# クリーン
yarn clean
```

## ディレクトリ構造

```
src/
├── index.ts              # 公開API
├── transpile.ts          # メインオーケストレーター
├── types.ts              # 全型定義
├── cli.ts                # CLIエントリ
├── parser/               # ASTパーサー (ts-morph)
├── cfg/                  # 制御フローグラフ構築
├── ir/                   # 中間表現生成
├── asl/                  # ASLシリアライザー
└── plugins/              # サービスプラグイン
    ├── dynamodb.ts
    ├── s3.ts
    ├── sqs.ts
    └── sns.ts
```
