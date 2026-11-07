# Mulqi MP Skills

Plugin **DeepSeek Harness** native yang memaparkan koleksi 39 skill agent
reusable — untuk kerja engineering nyata dan produktivitas harian — sebagai
bundled skill provider read-only.

Plugin mendaftarkan satu provider ke registry skill host. Setiap skill
dipaparkan apa adanya di bawah `vendor/skills/`; provider menemukan mereka
saat runtime, sehingga koleksi di disk adalah sumber kebenaran tunggal.
Tidak ada konten skill yang tertanam di kode, jadi perubahan pada
`SKILL.md` mana pun langsung terpakai tanpa rebuild modul.

## Yang Anda dapatkan

- **39 skill** di empat kategori: engineering (20), productivity (7),
  misc (4), dan in-progress (8).
- **Penemuan native** — skill muncul di katalog skill host dan bisa
  dipanggil model (atau manusia, untuk skill yang di-invokasi pengguna).
- **Konten apa adanya** — badan instruksi setiap skill beserta file
  referensi saudaranya (`references/`, `scripts/`, glossary, ADR)
  dipertahankan persis. Path relatif dalam skill ter-resolve terhadap
  folder skill itu sendiri.
- **Tanpa mengubah surface host** — plugin hanya memasang satu baris
  plugin Cordis dan mendaftarkan satu provider. Tidak membuka port,
  tidak mengubah output model, tidak mengirim telemetri.

## Syarat

| Syarat | Nilai |
| --- | --- |
| DeepSeek Harness | `0.2.1-rc.2` (tepat) |
| Node.js | `^22.19.0 \|\| >=24.0.0` |
| Layanan skill host | `@deepseek-ai/dsh-skill` (disediakan bundle dasar) |

Plugin mengunci `engines.dsh` ke `0.2.1-rc.2`. Menjalankan versi Harness
lain akan ditolak saat instalasi/aktivasi kecuali exemption versi-tepat
diberikan.

## Instalasi

### Dari GitHub (disarankan)

Pasang bundle ke sebuah profil dengan install-spec shorthand `github:`,
lalu restart profil itu:

```bash
dsh plugin --profile <profil> add github:mulqizamzam/mulqi-mp-skills
```

CLI menjalankan `pnpm add` di direktori profil dan — karena `package.json`
mendeklarasikan `dsh.bundle` → `./cordis.patch.yml` — mendaftarkan bundle ke
`dsh.profile.bundles` secara otomatis. Tidak perlu edit manifest manual;
patch menyisipkan satu baris mount yang memuat modul ini, dan `apply(ctx)`
-nya mendaftarkan provider.

### Dari checkout lokal

Semua bentuk install-spec yang diterima CLI bisa dipakai: URL git penuh,
tarball, atau path lokal.

```bash
git clone https://github.com/mulqizamzam/mulqi-mp-skills.git
dsh plugin --profile <profil> add /path/ke/mulqi-mp-skills
```

### Verifikasi tanpa boot

```bash
dsh --profile <profil> --dump-config | grep mulqi-mp-skills
```

Baris mount yang terpasang (tanpa baris `skipping profile bundle`)
memastikan pin engine terpenuhi dan bundle terpasang. Setelah restart
profil, log boot menampilkan provider mendaftarkan 39 skill dari
`vendor/skills/`.

### Pin versi host

Plugin mengunci `engines.dsh` ke `0.2.1-rc.2` tepat. Pada versi host
lain, instalasi/aktivasi ditolak; berikan exemption hanya bila Anda
menerima risikonya untuk versi-versi tersebut:

```bash
dsh plugin --profile <profil> allow-version mulqi-mp-skills@0.1.0 \
  --dsh-version <versi-host-tepat> --accept-risk
```

## Bahasa

- English: [README.md](README.md)
- Bahasa Indonesia: [README.id.md](README.id.md)
- 中文: [README.zh.md](README.zh.md)

## Penggunaan

Setelah terpasang, 39 skill tersedia melalui katalog skill normal. Skill
yang bisa di-invokasi model dipicu dari tugas; skill yang di-invokasi
pengguna (ditandai di katalog) dipanggil secara eksplisit.

Skill dikelompokkan berdasarkan intent, jadi kebanyakan tugas cukup
melalui set entry kecil:

| Saya ingin... | Mulai dari |
| --- | --- |
| Menemukan skill/alur yang tepat untuk situasi | `ask-matt` (pengguna) / `grill-with-docs` |
| Mengubah percakapan jadi spec, lalu tiket, lalu kode | `to-spec` → `to-tickets` → `implement-spec` |
| Membangun dengan test-first | `tdd` |
| Merancang atau memperdalam interface modul | `codebase-design` / `domain-modeling` |
| Mengebug bug atau regresi sulit | `diagnosing-bugs` |
| Mereview branch atau PR | `code-review` / `pr` |
| Merencanakan kerja besar | `wayfinder` |
| Retrospektif atau serah-terima | `retro` / `handoff` |

Katalog lengkap dan apa adanya — setiap skill dengan deskripsi persis
dan mode invokasinya — ada di [docs/skills-catalog.md](docs/skills-catalog.md).

## Cara kerja provider

- `index.js` memuat plugin Cordis: `name`, `inject: ['skills']`, dan
  `apply(ctx)`.
- `apply(ctx)` memanggil `ctx.skills.registerProvider(...)` dengan
  provider read-only yang `list()`-nya berjalan di atas
  `vendor/skills/**/SKILL.md` dan `get()`-nya memuat satu badan skill
  saat dibutuhkan.
- Setiap kandidat membawa `resourceBase = { kind: 'directory', path:
  <dir-skill> }`, sehingga referensi skill ke file saudaranya
  ter-resolve terhadap foldernya sendiri. Frontmatter
  `disable-model-invocation` dihormati, membuat skill hanya
  di-invokasi pengguna.
- Provider didaftarkan ke layer konteks pemanggil; saat teardown,
  disposer yang dikembalikan mendaftarnya keluar.

Lihat [docs/provider.md](docs/provider.md) untuk detail kontrak dan field
frontmatter yang dibaca provider.

## Konfigurasi

Tidak ada permukaan konfigurasi. Perilaku sepenuhnya ditentukan file
skill di bawah `vendor/skills/`. Untuk menambah atau mengubah skill,
edit atau tambah `SKILL.md` di sana (`name` kebab-case valid +
`description` wajib) lalu restart profil.

## Pemecahan masalah

| Gejala | Kemungkinan penyebab / perbaikan |
| --- | --- |
| `Plugin mulqi-mp-skills@0.1.0 is incompatible with dsh <ver>` | Harness berjalan bukan `0.2.1-rc.2`. Gunakan versi itu, atau berikan exemption versi-tepat. |
| Skill tidak ada di katalog | Pastikan baris mount ada (`--dump-config \| grep mulqi-mp-skills`) dan `vendor/skills/` utuh. |
| Penolakan `engines.dsh` setelah bump Harness | Pin exact disengaja. Berikan exemption hanya untuk versi plugin dan runtime yang persis Anda terima risikonya. |

## Verifikasi

- `node --check index.js` — sintaks modul.
- `npm test` — asersi provider (penemuan, bentuk, flag invokasi,
  round-trip pemuatan, penanganan kandidat lenyap).
- `node tests/verify.mjs` — mem-parse ulang frontmatter setiap
  `SKILL.md` lewat parser YAML yang sama dengan yang dipakai host.

## Lisensi

MIT. Konten skill bundled © 2026 Matt Pocock di bawah Lisensi MIT;
lihat [LICENSE](LICENSE) dan [NOTICE.md](NOTICE.md). Kode provider di
`index.js` beserta file manifest/mount dirilis di bawah lisensi yang sama.
