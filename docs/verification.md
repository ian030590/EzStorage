# 驗證紀錄

執行環境：Node.js 26.13.1，2026-11-18。

`npm test`：7 個測試檔全部通過。

- 後端：實際 Express request/response 與 SQLite 檔案，測試登入權限、資料持久化、財編唯一、版本衝突、庫存與並行借用、分次歸還、延長 token、每日任務、郵件重試、QR 與維護帳號 CLI。
- 前端：jsdom 執行實際前端與共用引擎，驗證登入、名稱跳脫、房間改名、財編 PATCH、跨層拖曳、座標同步、寫入失敗、QR 與借用流程。
- 管理表單：不同表單及所選物品／儲存處的草稿保留、表單旁的儲存／錯誤訊息、失敗後重試，以及進階欄位收合狀態。
- 空間介面：完成擺設後與借用人瀏覽時仍顯示座標位置圖、前後方向標示、空房間引導、選取後的介面狀態與雙向旋轉控制；新增物品分散放置，不改動既有位置。
- 3D：實際 Three.js 幾何與射線搭配 DOM／WebGLRenderer 替身，驗證家具拖曳、旋轉、巢狀箱子跟隨、取消與儲存失敗還原。
- 位置計算：旋轉後的邊界與父子儲存處關係。
- 部署：Bash 語法與 Docker 指令替身，驗證首次產生強密碼及 `.env` 權限、重跑不覆寫、daemon／Compose 失敗時不回報啟動成功。

另以實際前端、Express 與 SQLite 執行一次無 socket 整合驗證：登入、空房間引導、新增儲存處與物品、跨表單草稿、重複財編的表單旁錯誤、唯讀位置圖、總覽切換、旋轉寫入、借用人註冊、預約、領取與歸還全部通過。這項驗證使用 jsdom 與 3D 介面替身，沒有瀏覽器排版或 WebGL 畫面。

本次重新實測仍無法啟動真正瀏覽器：HTTP 監聽 `127.0.0.1` 回傳 `EPERM`；保留 Chromium 沙箱時啟動失敗，記錄為 `sandbox_host_linux.cc: shutdown: Operation not permitted`。未停用沙箱。瀏覽器驗收程式實際執行後以非零狀態結束，`test-results/browser/report.json` 為 `BLOCKED`，沒有任何成功的畫面或截圖紀錄。因此桌機與手機的實際畫面驗收尚未完成，DOM 測試通過不代表排版已驗收。

桌機／手機驗收程式為 `scripts/browser-qa.cjs`。在允許 Chromium 沙箱及本機 HTTP 監聽的主機安裝專案套件與瀏覽器後執行：

```sh
npm ci
npx playwright-core install chromium
npm run test:browser
```

程式使用臨時 SQLite、隨機測試密碼及合成驗收資料，不讀取 `.env`，不使用正式資料庫，也不寄出 Email。會在 1440 × 900、390 × 844 與 375 × 667 執行管理者與借用人流程，檢查唯讀位置、草稿／錯誤、旋轉儲存、空房間、借還及 QR 圖片，並將真實截圖與 JSON 報告放在 `test-results/browser/`。可用 `CHROMIUM_EXECUTABLE` 指定既有 Chromium，`PLAYWRIGHT_MODULE` 指定既有 Playwright Core 模組，`QA_OUTPUT` 指定輸出目錄。`PASS` 須等三個尺寸全部完成才會產生；環境無法啟動標記 `BLOCKED`，流程斷言失敗標記 `FAIL`。

未完成全新 `npm ci`、真實容器建置啟動與真實 SMTP 連線；先前環境亦無法啟動 Docker daemon 或解析 npm registry DNS。郵件測試使用替身，不代表寄出過任何真實郵件。

發布者應在可連網且能執行 Docker 的主機執行 `./deploy.sh`，確認健康檢查後，以桌機與手機瀏覽器驗收空白房間新增、自由命名、拖曳、重新整理位置、QR 列印與一次借還流程；需要 Email 時再驗證自己設定的 SMTP。
