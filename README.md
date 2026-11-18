# EzStorage

以 3D 房間管理教學／治療教具的開源借用系統。可自行架設，不需要 Google Apps Script、Google Sheet 或 Google 帳號。

採用 **Node.js 24.15+、Express 5、SQLite、Three.js**。前端沿用輕量 JavaScript 模組與原有房間介面，由 Express 同源提供前端與 REST API，免前端建置；SQLite 不需另開資料庫服務，適合單一單位的小型共用部署。瀏覽器只負責呈現與預估，後端會再次驗證每次操作，並在資料庫交易中儲存。

## 一鍵部署

先安裝 Docker Engine 與 Docker Compose，下載此專案後執行：

```bash
./deploy.sh
```

腳本會在第一次執行時產生 `.env` 與隨機管理者密碼，建置映像、啟動服務並等待健康檢查。打開 <http://localhost:3000>，以 `.env` 中的 `ADMIN_EMAIL`、`ADMIN_PASSWORD` 登入。請保護 `.env`，不要提交到版本控制。

預設只綁定本機 `127.0.0.1`。需要區域網路存取時，在 `.env` 設定 `BIND_ADDRESS=0.0.0.0`，並把 `PUBLIC_URL` 改成實際網址後重跑腳本。公開服務請先架設 HTTPS 反向代理並設定 `COOKIE_SECURE=true`；QR Code 請從實際對外網址開啟列印。

```bash
./deploy.sh                    # 更新程式並重新建置，保留資料
docker compose logs -f        # 查看服務紀錄
docker compose down           # 停止，保留 SQLite volume
```

`docker compose down -v` 會刪除資料 volume，請勿把它當作日常停止指令。管理者環境變數只用於首次建立帳號，修改 `.env` 不會覆寫既有資料或密碼。

## 本機開發

```bash
cp .env.example .env
# 編輯 .env，設定自己的管理者 Email 與至少 12 字元密碼
npm ci
npm run dev
```

正式啟動用 `npm start`，測試用 `npm test`。資料預設位於 `data/ezstorage.sqlite`，可透過 `DATABASE_PATH` 更改。第一次啟動建立一間空白房間，請管理者新增儲存處與物品。若是試用，可在首次啟動前設定 `SEED_DEMO=true` 載入示範房間與教具；已初始化的資料不會被重設，也不建立虛構借用人或借用紀錄。

## 帳號建立與密碼重設

預設不開放自行註冊，由管理者在主機建立借用人。以 Bash 讀取密碼，避免密碼寫進 shell 指令歷史：

```bash
read -rs -p '新密碼（至少 12 字元）: ' EZSTORAGE_USER_PASSWORD; echo
export EZSTORAGE_USER_PASSWORD
docker compose exec -T -e EZSTORAGE_USER_PASSWORD ezstorage node scripts/user.cjs create colleague@example.com '同事姓名'
unset EZSTORAGE_USER_PASSWORD
```

重設現有帳號時，把 `create colleague@example.com '同事姓名'` 改成 `reset colleague@example.com`；既有登入工作階段會失效。本機 Node 部署可改用 `node --env-file-if-exists=.env scripts/user.cjs create EMAIL NAME`。

確定要讓所有能連到網站的人自行建立借用人帳號時，才在 `.env` 設定 `ALLOW_REGISTRATION=true` 並重新啟動。註冊不會授予管理者權限。

## 操作

- 未登入可瀏覽房間、搜尋物品與列印 QR Code；借還與預約需以站內帳號登入。
- 管理者可新增、自由命名房間、儲存處及物品。開啟「佈置模式」，拖曳 3D 家具、旋轉方向；層架上的收納箱會跟著家具移動。
- 物品可在儲存層內拖曳擺設，也可移到其他儲存處／層；提供表單位置欄位作為鍵盤操作替代。儲存成功後重新整理仍保留。
- 透過 QR 頁面進入借用、領取與分次歸還；「我的借用」支援取消、改期、延長協調與直接轉交。
- 財產編號與位置編號分開管理。請參閱[財編命名參考](docs/asset-numbering.md)，網頁內也能開啟參考規則。

## 郵件與排程

未設定 SMTP 時，通知會保留於收件人的站內通知，不會寄出 Email。若要寄出，於 `.env` 設定 `SMTP_HOST`、`SMTP_PORT`、`SMTP_FROM`，需要驗證的服務再設定 `SMTP_USER`、`SMTP_PASS`。信件連結使用 `PUBLIC_URL`。請使用自己管理的 SMTP 服務或供應商提供的 SMTP 憑證。

服務內建排程，依 `Asia/Taipei` 每天早上 8 點後處理到期提醒與逾期未領取預約。服務停機時不會寄信；重啟後會補處理當日應辦事項。資料庫保留通知與借還事件。

## 桌機與手機驗收

```bash
npm ci
npx playwright-core install chromium --only-shell
npm run test:browser
```

驗收會用臨時 SQLite 與測試帳號，依序執行 1440×900、390×844、375×667 的瀏覽器流程；不讀取正式 `.env` 或寄信。結果與截圖寫到 `test-results/browser/`。若瀏覽器安裝在其他位置，可設定 `CHROMIUM_EXECUTABLE`。腳本會將環境限制記為 `BLOCKED` 並回傳失敗碼，不會把未執行的驗收視為通過。

未儲存的管理草稿只保留在本次瀏覽，重新整理前請先儲存。一般瀏覽也能查看層內配置，只有管理者的自由擺設模式能拖曳。

## 資料與備份

Docker 使用 `ezstorage-data` named volume，容器重建不會清空資料。請定期備份 SQLite；最簡單的方式是先停止服務再複製，避免只複製正在寫入的主檔而漏掉 WAL：

```bash
mkdir -p backups
docker compose stop
cid=$(docker compose ps -a -q ezstorage)
docker cp "$cid:/app/data/." "backups/$(date +%Y%m%d-%H%M%S)"
docker compose start
```

還原時先停止服務，把同一份備份中的主檔與 WAL／SHM 檔一起還原至資料 volume，再啟動。備份含帳號、Email、通知及借還紀錄，須保護存取權限。

帳號與工作階段分表儲存；借還與目錄狀態以單一 SQLite JSON 文件交易保存。SQLite 版本使用單一應用程式服務與資料檔，勿將同一個檔案放在網路檔案系統上供多個容器同時寫入。需要跨主機擴充時再遷移到 PostgreSQL；本版沒有未驗證的雙資料庫切換功能。

## 專案結構

```text
prototype/      正式 Web 前端（沿用原型目錄名稱）
shared/         前後端共用借還規則與擺設計算
server/         Express API、SQLite、登入、郵件與排程
scripts/        維護工具
tests/          後端、擺設與部署腳本測試
docs/           財產編號參考
```

程式採 [MIT License](LICENSE)。第三方依賴維持各自授權（Three.js／Express／QRCode 為 MIT，Nodemailer 10 為 MIT-0）。提交流程請見 [CONTRIBUTING.md](CONTRIBUTING.md)。技術依據：[Node SQLite](https://nodejs.org/api/sqlite.html)、[Express 靜態檔服務](https://expressjs.com/en/starter/static-files.html)、[Docker 資料 volume](https://docs.docker.com/engine/storage/volumes/)。

本次已執行的測試及環境限制請見[驗證紀錄](docs/verification.md)。
