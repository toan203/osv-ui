<div align="center">
  
![osv-ui dashboard](./docs/screenshot.png)

# osv-ui

**Một Dashboard CVE đẹp mắt, không cần cấu hình cho các dự án npm, Python, Go và Rust.**  
Một câu lệnh. Không cần đăng ký. Không cần API key. **Chạy 100% locally — code của bạn không bao giờ rời khỏi máy.**

[![npm version](https://img.shields.io/npm/v/osv-ui?color=red&label=npm)](https://www.npmjs.com/package/osv-ui)
[![npm downloads](https://img.shields.io/npm/dm/osv-ui?color=orange)](https://www.npmjs.com/package/osv-ui)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16-blue)](https://nodejs.org)

[🇻🇳 Tiếng Việt](README.vi.md) · [🇺🇸 English](README.md) · [🇨🇳 中文](README.zh.md) · [🇯🇵 日本語](README.ja.md)

</div>

---

## Vấn đề

```bash
$ npm audit

# ... 300 dòng như thế này ...
# moderate  Regular Expression Denial of Service in semver
# package   semver
# patched in >=7.5.2
# ...
# 12 vulnerabilities (3 moderate, 6 high, 3 critical)
```

Không ai muốn đọc những dòng text khô khan đó. Bảo mật thường bị ngó lơ. Các thư viện phụ thuộc vẫn tiếp tục chứa lỗ hổng.

## Giải pháp

```bash
npx osv-ui
```

→ Mở ngay một dashboard trực quan. Mọi CVE, mọi cách fix, cho tất cả các service của bạn. Xong.

### Tại sao nên thử dùng?

- **Không cấu hình**: Không cần cài đặt phức tạp, không cần tạo tài khoản hay API Key.
- **Quyền riêng tư là trên hết**: Việc phân tích được thực hiện 100% trên máy của bạn.
- **Nhanh & Trực quan**: Hiển thị điểm rủi ro, biểu đồ lỗ hổng và hướng dẫn nâng cấp chi tiết trong vài giây.
- **Đa nền tảng**: Hỗ trợ sẵn cho hệ sinh thái Node.js (npm), Python, Go và Rust.

---

## Tính năng nổi bật

| | |
|---|---|
| 🟨 **npm** + 🐍 **Python** + 🔵 **Go** + 🦀 **Rust** | Quét `package-lock.json`, `Pipfile.lock`, `poetry.lock`, `requirements.txt`, `go.sum`, `Cargo.lock` |
| 📡 **Dữ liệu CVE trực tiếp** | Cung cấp bởi [OSV.dev](https://osv.dev) — cập nhật hàng ngày từ NVD, GitHub Advisory, PyPI Advisory. **Không cần API key.** |
| 🏢 **Đa dịch vụ (Multi-service)** | Quét toàn bộ monorepo chỉ với một câu lệnh — frontend, backend, workers, ML services |
| 💊 **Hướng dẫn Fix** | Bảng nâng cấp kiểu Dependabot: phiên bản hiện tại → phiên bản an toàn + lệnh copy 1-click |
| 🔌 **Built-in REST API** | Tự tạo dashboard bảo mật của riêng bạn với `GET /api/data` hoặc xuất báo cáo qua CLI |
| 🎯 **Điểm rủi ro (Risk score)** | 0–100 cho mỗi dịch vụ giúp bạn biết cần ưu tiên xử lý đâu trước |
| 🔍 **Chi tiết CVE** | Click bất kỳ dòng nào: điểm CVSS, mô tả, link NVD/GitHub Advisory |
| 🌙 **Chế độ tối (Dark mode)** | Bảo vệ mắt khi audit bảo mật vào ban đêm |

---

## Bắt đầu nhanh

**Quét thư mục hiện tại:**
```bash
npx osv-ui
```

**Quét một monorepo (nhiều dịch vụ cùng lúc):**
```bash
npx osv-ui ./frontend ./api ./worker ./ml-service
```

**Tự động tìm kiếm tất cả dịch vụ trong thư mục hiện tại:**
```bash
npx osv-ui -d
```

**Thêm vào scripts của `package.json`:**
```json
{
  "scripts": {
    "audit:ui":  "npx osv-ui",
    "audit:all": "npx osv-ui ./frontend ./api ./worker"
  }
}
```

```
--discover, -d  Tự động tìm các thư mục chứa file manifest được hỗ trợ
--port=2003     Sử dụng port tùy chỉnh (mặc định: 2003)
--json[=file]   Lưu báo cáo dưới dạng JSON (mặc định: osv-report.json)
--html[=file]   Lưu báo cáo dưới dạng HTML (mặc định: osv-report.html)
--no-open       Không tự động mở trình duyệt
--offline       Bỏ qua truy vấn OSV.dev — chỉ parse các file manifest
-h, --help      Hiển thị hướng dẫn
```

### 🔌 Powerful built-in API

`osv-ui` không chỉ là một dashboard; nó là một engine dữ liệu bảo mật.  
Khi dashboard đang chạy, bạn có thể lấy dữ liệu bảo mật thô của toàn bộ dự án:

```bash
# Lấy toàn bộ dữ liệu JSON của các dịch vụ
curl http://localhost:2003/api/data

# Sử dụng trong các script tùy chỉnh của bạn
curl -s http://localhost:2003/api/data | jq '.[0].vulns'
```

---

## Các file manifest được hỗ trợ

| Hệ sinh thái | Các file |
|-----------|-------|
| **npm** | `package-lock.json` (lockfileVersion 1, 2, 3) |
| **Python** | `requirements.txt` · `Pipfile.lock` · `poetry.lock` · `pyproject.toml` |
| **Go** | `go.sum` |
| **Rust** | `Cargo.lock` |

Nhiều hệ sinh thái khác đang được phát triển — xem [Lộ trình](#lộ-trình).

---

## Cách hoạt động

```
File dự án của bạn
    │
    ├─ package-lock.json   ──┐
    ├─ Pipfile / poetry    ──┤──► parser ──► danh sách package
    ├─ go.sum / Cargo.lock ──┘
                                     │
                                     ▼
                             OSV.dev batch API  (miễn phí, không cần key)
                                     │
                                     ▼
                             Các CVE khớp + phiên bản vá lỗi
                                     │
                                     ▼
                          Server Express → Dashboard trên trình duyệt
                               http://localhost:2003
```

Dữ liệu CVE đến từ **[OSV.dev](https://osv.dev)** — một cơ sở dữ liệu mở và miễn phí được duy trì bởi Google, tổng hợp từ:
- 🇺🇸 [NVD](https://nvd.nist.gov) — Cơ sở dữ liệu lỗ hổng quốc gia của Mỹ
- 🐙 [GitHub Advisory Database](https://github.com/advisories) (GHSA)
- 🐍 [PyPI Advisory Database](https://github.com/pypa/advisory-database)
- 📦 npm Advisory Database
- 🦀 RustSec · Go Vuln DB · OSS-Fuzz · và nhiều nguồn khác

Cập nhật **hàng ngày**. Không cần tài khoản. Không giới hạn lượt truy cập.

---

## So sánh với các giải pháp khác

| | **osv-ui** | `npm audit` | Snyk | Dependabot |
|---|:---:|:---:|:---:|:---:|
| Dashboard trực quan | ✅ | ❌ chỉ hiện terminal | ✅ | ✅ |
| Hỗ trợ npm | ✅ | ✅ | ✅ | ✅ |
| Hỗ trợ Python | ✅ | ❌ | ✅ | ✅ |
| Đa dịch vụ trong 1 view | ✅ | ❌ | ✅ (trả phí) | ✅ |
| Không cần đăng ký | ✅ | ✅ | ❌ | ❌ |
| Hoạt động trên **GitLab Free** | ✅ | ✅ | ❌ | ❌ |
| Tự host / chạy local | ✅ | ✅ | ❌ | ❌ |
| Lệnh hướng dẫn Fix | ✅ | một phần | ✅ | ✅ |
| Mã nguồn mở | ✅ | ✅ | ❌ | ❌ |

---

## GitLab CI — Chặn deploy nếu có CVE nghiêm trọng

Không có Dependabot trên GitLab Free? Thêm nội dung này vào `.gitlab-ci.yml`:

```yaml
audit:
  stage: test
  image: node:20-alpine
  script:
    - npm audit --json > /tmp/audit.json || true
    - |
      node -e "
        const r = require('/tmp/audit.json');
        const crit = Object.values(r.vulnerabilities || {})
          .filter(v => v.severity === 'critical').length;
        if (crit > 0) {
          console.error('BỊ CHẶN: Phát hiện ' + crit + ' CVE nghiêm trọng. Chạy: npx osv-ui');
          process.exit(1);
        }
        console.log('OK: không có lỗ hổng nghiêm trọng');
      "
  artifacts:
    paths: [/tmp/audit.json]
    when: always
```

---

## Yêu cầu hệ thống

- **Node.js** >= 16
- Truy cập Internet để truy vấn OSV.dev — hoặc dùng `--offline`
- Dự án npm: chạy `npm install` trước để có file `package-lock.json`
- Dự án Python: bất kỳ file manifest nào trong danh sách hỗ trợ bên trên

---

## Lộ trình phát triển

Mọi đóng góp đều được trân trọng. Nếu bạn muốn phát triển tính năng mới, hãy tạo issue trước để chúng ta cùng thảo luận.

- [x] **Hỗ trợ Go** — parse `go.sum` / `go.mod`
- [x] **Hỗ trợ Rust** — parse `Cargo.lock`
- [x] **Xuất báo cáo** — lưu dưới dạng HTML / JSON
- [x] **Dark mode** — giao diện Dashboard dịu mắt
- [ ] **Java / Maven** — parse `pom.xml`
- [ ] **GitHub Actions** — đăng comment so sánh CVE trên PRs
- [ ] **Xuất SBOM** — định dạng CycloneDX / SPDX
- [ ] **Chế độ theo dõi (Watch mode)** — tự động quét lại khi file manifest thay đổi
- [ ] **Slack / webhook** — thông báo khi có CVE nghiêm trọng mới

---

## Đóng góp (Contributing)

Dự án này được xây dựng bởi cộng đồng. Chào đón mọi cấp độ kỹ năng.

**Các issue phù hợp cho người mới bắt đầu:**
- Thêm bộ parse cho Java/Maven (`pom.xml`) — làm theo mẫu trong `src/parsers.js`
- Viết unit test cho các bộ parse
- Cải thiện các trường hợp đặc biệt cho bộ parse Python

```bash
# Clone và chạy local
git clone https://github.com/toan203/osv-ui
cd osv-ui
npm install

# Chạy thử với project của bạn
node bin/cli.js /đường/dẫn/đến/project

# Chạy thử với# Chạy demo multi-service
node bin/cli.js ./backend ./frontend
```

Vui lòng đọc [CONTRIBUTING.md](CONTRIBUTING.md) để biết thêm về phong cách code và quy trình gửi PR.

---

## Giấy phép (License)

[MIT](LICENSE) — Bạn có thể toàn quyền sử dụng, fork, nhúng hoặc xây dựng dựa trên dự án này.

---

<div align="center">

Dự án của bạn đã tránh được CVE nhờ osv-ui?  
Một ⭐ của bạn giúp các lập trình viên khác tìm thấy công cụ này dễ dàng hơn.

[![Sponsor this project](https://img.shields.io/badge/Sponsor-this%20project-lightgrey?style=flat-square&logo=ko-fi)](https://ko-fi.com/P5P31W9W6A)

**[Chia sẻ trên Twitter](https://twitter.com/intent/tweet?text=Just%20found%20osv-ui%20%E2%80%94%20a%20beautiful%20one-command%20CVE%20dashboard%20for%20npm%20%26%20Python.%20Free%2C%20no%20signup%3A%20npx%20osv-ui%20%F0%9F%94%A5&url=https://github.com/toan203/osv-ui)** · **[Đăng trên Reddit](https://reddit.com/submit?url=https://github.com/toan203/osv-ui&title=osv-ui%20%E2%80%94%20visual%20CVE%20dashboard%20for%20npm%20%26%20Python%2C%20one%20command%2C%20no%20signup)**

</div>
