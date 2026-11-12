// ================================================================
// Filter Wajah "Wisuda dan Kampus"
// MindAR (face tracking) + Three.js — seluruh pemrosesan di perangkat
// ================================================================
import * as THREE from 'three';
import { MindARThree } from 'mindar-face-three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---------------------------------------------------------------
// 1. KONFIGURASI (ubah di sini bila perlu)
// ---------------------------------------------------------------
const KUNCI_FILTER = 'wisuda.filterTerakhir'; // localStorage: filter terakhir
const DEBUG = new URLSearchParams(location.search).has('debug'); // buka ...?debug=1

// Kehalusan tracking (opsional). Jika aksesori bergetar: turunkan filterMinCF.
// Jika aksesori terasa tertinggal: naikkan filterBeta.
// Contoh: { filterMinCF: 0.001, filterBeta: 1000 }
const OPSI_PELACAK = {};

// Intensitas cahaya (uji di ruangan terang/redup, lalu sesuaikan)
const CAHAYA = { hemisphere: 0.8, arah: 1.2 };

// Titik (landmark) MediaPipe Face Mesh yang dipakai sebagai "sensor"
const LANDMARK = { kiri: 127, kanan: 356, atas: 10, bawah: 152, bibirAtas: 13, bibirBawah: 14 };
const SAMPEL_KALIBRASI = 12; // jumlah frame untuk mengukur lebar wajah

// ---------------------------------------------------------------
// 2. ELEMEN UI & UTILITAS
// ---------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const el = {
  container: $('ar-container'),
  toast: $('toast'),
  label: $('label-filter'),
  ui: $('ui'),
  daftar: $('daftar-filter'),
  btnKamera: $('btn-kamera'),
  btnPrev: $('btn-prev'),
  btnNext: $('btn-next'),
  btnFoto: $('btn-foto'),
  mulai: $('layar-mulai'),
  btnMulai: $('btn-mulai'),
  memuat: $('layar-memuat'),
  teksMemuat: $('teks-memuat'),
  bar: $('bar-progres'),
  error: $('layar-error'),
  judulError: $('judul-error'),
  isiError: $('isi-error'),
  btnCoba: $('btn-coba'),
  pratinjau: $('pratinjau'),
  imgPratinjau: $('img-pratinjau'),
  btnSimpan: $('btn-simpan'),
  btnTutup: $('btn-tutup'),
};

const tampil = (e) => e.classList.remove('hidden');
const sembunyi = (e) => e.classList.add('hidden');

let timerToast;
function toast(teks, ms = 2200) {
  el.toast.textContent = teks;
  el.toast.classList.add('tampil');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => el.toast.classList.remove('tampil'), ms);
}

let timerLabel;
function tampilLabel(teks) {
  el.label.textContent = teks;
  el.label.classList.add('tampil');
  clearTimeout(timerLabel);
  timerLabel = setTimeout(() => el.label.classList.remove('tampil'), 1100);
}

function setMemuat(teks, pecahan) {
  el.teksMemuat.textContent = teks;
  el.bar.style.width = `${Math.round(pecahan * 100)}%`;
}

function tampilkanError({ judul, isi, tombol = 'Coba lagi' }) {
  sembunyi(el.memuat);
  sembunyi(el.mulai);
  sembunyi(el.ui);
  el.judulError.textContent = judul;
  el.isiError.textContent = isi;
  el.btnCoba.textContent = tombol;
  tampil(el.error);
}

// ---------------------------------------------------------------
// 3. IZIN KAMERA — periksa lebih dulu agar pesan error jelas
// ---------------------------------------------------------------
async function cekIzinKamera(facing) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    const e = new Error('Konteks tidak aman atau getUserMedia tidak tersedia');
    e.name = 'NotSupportedError';
    throw e;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facing } });
  stream.getTracks().forEach((t) => t.stop()); // hanya mengecek; MindAR membuka kamera sendiri
}

function pesanErrorKamera(err) {
  const nama = err?.name || '';
  if (nama === 'NotSupportedError' || !window.isSecureContext) {
    return {
      judul: 'Halaman harus memakai HTTPS',
      isi: 'Browser hanya mengizinkan kamera di halaman HTTPS (atau localhost).\nBuka halaman ini lewat alamat yang diawali https:// lalu coba lagi.',
    };
  }
  if (nama === 'NotAllowedError' || nama === 'PermissionDeniedError' || nama === 'SecurityError') {
    return {
      judul: 'Izin kamera ditolak',
      isi:
        'Filter wajah butuh kamera untuk melacak wajahmu. Video diproses langsung di perangkatmu dan tidak dikirim ke mana pun.\n\n' +
        'Cara mengaktifkan:\n' +
        '• Android (Chrome): ketuk ikon gembok di sebelah alamat → Izin → Kamera → Izinkan.\n' +
        '• iPhone (Safari): ketuk "aA" di bilah alamat → Pengaturan Situs Web → Kamera → Izinkan.\n\n' +
        'Setelah itu ketuk "Coba lagi". Jika masih gagal, muat ulang halaman.',
    };
  }
  if (nama === 'NotFoundError' || nama === 'DevicesNotFoundError' || nama === 'OverconstrainedError') {
    return { judul: 'Kamera tidak ditemukan', isi: 'Perangkat ini tidak memiliki kamera yang bisa dipakai. Coba di perangkat lain.' };
  }
  if (nama === 'NotReadableError' || nama === 'TrackStartError') {
    return { judul: 'Kamera sedang dipakai', isi: 'Kamera dipakai aplikasi atau tab lain. Tutup aplikasi tersebut lalu ketuk "Coba lagi".' };
  }
  return { judul: 'Kamera tidak bisa dibuka', isi: 'Terjadi kesalahan saat membuka kamera. Ketuk "Coba lagi" atau muat ulang halaman.' };
}

function tampilkanErrorKamera(err) {
  console.warn('Kamera gagal:', err);
  tampilkanError(pesanErrorKamera(err));
}

// ---------------------------------------------------------------
// 4. STATE
// ---------------------------------------------------------------
let config, mindar, renderer, scene, camera;
const anchors = new Map(); // nomor landmark -> anchor MindAR
const sensor = {};         // anchor "sensor" (kiri, kanan, atas, bawah, bibir)
const akses = new Map();   // id aksesori -> objek aksesori
const clock = new THREE.Clock();

const state = {
  dibangun: false,
  siap: false,        // true setelah lebar wajah terukur
  lebarWajah: 1,      // dalam satuan lokal anchor
  sampel: [],
  filterIdx: 0,
  mulutTerbuka: false,
  terakhirKonfeti: -10,
  boost: 1,           // pengali goyangan saat kepala miring
  sibukKamera: false,
  fotoBlob: null,
  fotoUrl: null,
  ukur: null,
  bingkai: 0,
};

function ambilAnchor(indeks) {
  if (!anchors.has(indeks)) anchors.set(indeks, mindar.addAnchor(indeks));
  return anchors.get(indeks);
}

// ---------------------------------------------------------------
// 5. MEMBANGUN SCENE
// ---------------------------------------------------------------
const gltfLoader = new GLTFLoader();
{
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  gltfLoader.setDRACOLoader(draco);          // dukung GLB hasil kompresi Draco
  gltfLoader.setMeshoptDecoder(MeshoptDecoder); // dukung GLB hasil kompresi Meshopt
}

async function bangunScene() {
  setMemuat('Memuat konfigurasi…', 0.1);
  const res = await fetch('filters.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('filters.json tidak ditemukan');
  config = await res.json();
  config.efek = { mulutTerbuka: true, kepalaMiring: true, ambangMulut: 0.06, ambangMiringDerajat: 15, ...config.efek };

  // uiScanning memakai elemen #hint-wajah milik kita; MindAR menampilkan/menyembunyikannya.
  mindar = new MindARThree({
    container: el.container,
    uiLoading: 'no',
    uiScanning: '#hint-wajah',
    uiError: 'no',
    ...OPSI_PELACAK,
  });
  ({ renderer, scene, camera } = mindar);

  // Pencahayaan: lampu + environment map agar material logam/kaca terlihat hidup
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, CAHAYA.hemisphere));
  const arah = new THREE.DirectionalLight(0xffffff, CAHAYA.arah);
  arah.position.set(0.5, 1, 1);
  scene.add(arah);
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  } catch (e) {
    console.warn('Environment map dilewati:', e);
  }

  // Occluder: mesh wajah tak terlihat yang menutupi bagian aksesori di balik wajah
  // (mis. gagang kacamata). Matikan lewat "occluder": false di filters.json bila aksesori terpotong.
  if (config.occluder !== false) {
    const occ = mindar.addFaceMesh();
    occ.material = new THREE.MeshBasicMaterial({ colorWrite: false });
    occ.renderOrder = -1;
    scene.add(occ);
  }

  for (const [kunci, indeks] of Object.entries(LANDMARK)) sensor[kunci] = ambilAnchor(indeks);

  // Muat semua aksesori paralel
  const daftar = Object.entries(config.aksesori);
  let selesai = 0;
  await Promise.all(
    daftar.map(async ([id, cfg]) => {
      try {
        akses.set(id, await muatAksesori(id, cfg));
      } catch (err) {
        console.error(`Gagal memuat aksesori "${id}"`, err);
        toast(`Model "${cfg.nama || id}" gagal dimuat`, 4500);
      }
      selesai += 1;
      setMemuat(`Memuat aksesori 3D (${selesai}/${daftar.length})…`, 0.15 + (0.6 * selesai) / daftar.length);
    })
  );

  bangunDaftarFilter();
  state.filterIdx = bacaFilterTerakhir();
  terapkanFilter(state.filterIdx, { label: false });
  if (DEBUG) bangunPanelDebug();
  state.dibangun = true;
}

// ---------------------------------------------------------------
// 6. AKSESORI: muat, pasang, skala otomatis, animasi
// ---------------------------------------------------------------
async function muatAksesori(id, cfg) {
  cfg.anchor ??= 168;
  cfg.pivot ??= 'tengah';
  cfg.sumbuLebar ??= 'x';
  cfg.lebarRelatif ??= 1;
  cfg.skala ??= 1;
  cfg.posisi ??= [0, 0, 0];
  cfg.rotasiDerajat ??= [0, 0, 0];

  const gltf = await gltfLoader.loadAsync(cfg.model);
  const model = gltf.scene;
  model.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false; // cegah model "hilang" karena bounding box
  });

  // Pusatkan pivot model (tengah, atau titik tengah bagian bawah)
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  if (!Number.isFinite(size.x) || size.lengthSq() === 0) throw new Error('Model kosong');
  model.position.sub(center);
  if (cfg.pivot === 'bawah') model.position.y += size.y / 2;

  // anchor.group -> offset (posisi/rotasi/skala dari JSON) -> anim (animasi prosedural) -> modelRoot -> model
  const modelRoot = new THREE.Group();
  modelRoot.add(model);
  const anim = new THREE.Group();
  anim.add(modelRoot);
  const offset = new THREE.Group();
  offset.add(anim);
  offset.visible = false; // tampil setelah lebar wajah terukur
  ambilAnchor(cfg.anchor).group.add(offset);

  const a = {
    id, cfg, model, modelRoot, anim, offset, size,
    clips: gltf.animations || [],
    mixer: null, tipeAnim: 'none', kilau: [], lensa: [],
  };
  siapkanAnimasi(a);
  return a;
}

// Skala & posisi dinyatakan RELATIF terhadap lebar wajah, jadi tidak tergantung satuan model.
function terapkanFit(a) {
  const lebarModel = Math.max(a.size[a.cfg.sumbuLebar] ?? a.size.x, 1e-6);
  const s = ((state.lebarWajah * a.cfg.lebarRelatif) / lebarModel) * a.cfg.skala;
  a.offset.scale.setScalar(s);
  a.offset.position.set(...a.cfg.posisi.map((v) => v * state.lebarWajah));
  a.offset.rotation.set(...a.cfg.rotasiDerajat.map((d) => THREE.MathUtils.degToRad(d)));
}

let texBintang;
function teksturBintang() {
  if (texBintang) return texBintang;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,240,180,0.7)');
  grad.addColorStop(1, 'rgba(255,240,180,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.moveTo(32, 2); g.lineTo(37, 27); g.lineTo(62, 32); g.lineTo(37, 37);
  g.lineTo(32, 62); g.lineTo(27, 37); g.lineTo(2, 32); g.lineTo(27, 27);
  g.closePath();
  g.fill();
  texBintang = new THREE.CanvasTexture(c);
  texBintang.colorSpace = THREE.SRGBColorSpace;
  return texBintang;
}

function siapkanAnimasi(a) {
  const an = a.cfg.animasi || {};
  let tipe = an.tipe || 'none';

  if (tipe === 'klip') {
    if (a.clips.length) {
      // Putar semua klip animasi bawaan GLB secara berulang
      a.mixer = new THREE.AnimationMixer(a.model);
      a.clips.forEach((c) => a.mixer.clipAction(c).setLoop(THREE.LoopRepeat, Infinity).play());
    } else {
      tipe = an.cadangan || 'goyang'; // GLB tanpa klip -> animasi prosedural pengganti
      console.info(`"${a.id}" tidak punya klip animasi, memakai animasi "${tipe}".`);
    }
  }

  if (tipe === 'berkilau') {
    // Bintang kecil berkedip di sekitar aksesori
    // Posisi bintang dibaca dari filters.json -> animasi.kilau = [[x, y, z], ...]
    // Satuan: pecahan ukuran model dari titik tengahnya (x: kanan, y: atas, z: depan/arah kamera).
    const yDasar = a.cfg.pivot === 'bawah' ? a.size.y / 2 : 0;
    const titik = an.kilau ?? [[-0.3, 0.2, -0.55], [0.3, 0.22, -0.55], [0.02, -0.18, -0.55]];
    titik.forEach(([fx, fy, fz = 0.55], i) => {
      const mat = new THREE.SpriteMaterial({
        map: teksturBintang(), color: 0xfff2b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const s = new THREE.Sprite(mat);
      s.position.set(fx * a.size.x, yDasar + fy * a.size.y, fz * a.size.z);
      s.userData = { fase: i * 2.1, dasar: a.size.x * (an.ukuranKilau ?? 0.16) };
      a.modelRoot.add(s);
      a.kilau.push(s);
    });
    // Lensa berdenyut (material yang namanya mengandung lens/lensa/glass/kaca)
    a.model.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (/lens|lensa|glass|kaca/i.test(`${o.name} ${o.material.name}`)) {
        o.material = o.material.clone();
        if (o.material.emissive) {
          o.material.emissive.set(0x9fd8ff);
          a.lensa.push(o.material);
        }
      }
    });
  }
  a.tipeAnim = tipe;
}

function perbaruiAnimasi(a, dt, t) {
  const an = a.cfg.animasi || {};
  const k = an.kecepatan ?? 2;

  if (a.mixer) {
    a.mixer.timeScale = 1 + (state.boost - 1) * 0.5;
    a.mixer.update(dt);
  }

  switch (a.tipeAnim) {
    case 'goyang': {
      const amp = (an.amplitudo ?? 0.07) * state.boost;
      a.anim.rotation.z = Math.sin(t * k) * amp;
      a.anim.rotation.x = Math.cos(t * k * 0.7) * amp * 0.4;
      break;
    }
    case 'melayang':
      a.anim.position.y = Math.sin(t * k) * (an.amplitudo ?? 0.03) * a.size.y;
      break;
    case 'berkilau':
      for (const s of a.kilau) {
        const p = 0.5 + 0.5 * Math.sin(t * k + s.userData.fase);
        s.scale.setScalar(s.userData.dasar * (0.3 + 0.9 * p));
        s.material.opacity = p;
        s.material.rotation = t * 0.6 + s.userData.fase;
      }
      for (const m of a.lensa) m.emissiveIntensity = 0.1 + 0.7 * (0.5 + 0.5 * Math.sin(t * k));
      break;
    default:
  }
}

// ---------------------------------------------------------------
// 7. PENGUKURAN WAJAH + EFEK (mulut terbuka, kepala miring)
// ---------------------------------------------------------------
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const posisiSensor = (nama, v) => v.setFromMatrixPosition(sensor[nama].group.matrix);

function ukurWajah() {
  const lebar = posisiSensor('kiri', v1).distanceTo(posisiSensor('kanan', v2));
  const tinggi = posisiSensor('atas', v1).distanceTo(posisiSensor('bawah', v2));
  const mulut = posisiSensor('bibirAtas', v1).distanceTo(posisiSensor('bibirBawah', v2)) / Math.max(tinggi, 1e-6);

  posisiSensor('kiri', v1);
  posisiSensor('kanan', v2);
  let miring = Math.abs((Math.atan2(v2.y - v1.y, v2.x - v1.x) * 180) / Math.PI);
  if (miring > 90) miring = 180 - miring; // 0 = tegak, 90 = rebah

  const skalaAnchor = new THREE.Vector3().setFromMatrixScale(sensor.atas.group.matrix).x || 1;
  return { lebarLokal: lebar / skalaAnchor, rasioTinggi: tinggi / Math.max(lebar, 1e-6), mulut, miring };
}

function kalibrasi(m) {
  // Abaikan frame yang belum valid (matriks identitas / bentuk tidak masuk akal)
  if (!(m.lebarLokal > 1e-4) || m.rasioTinggi < 0.9 || m.rasioTinggi > 1.9) return;
  state.sampel.push(m.lebarLokal);
  if (state.sampel.length < SAMPEL_KALIBRASI) return;

  state.sampel.sort((x, y) => x - y);
  state.lebarWajah = state.sampel[Math.floor(state.sampel.length / 2)]; // median
  for (const a of akses.values()) terapkanFit(a);
  buatKonfeti();
  state.siap = true;
  terapkanFilter(state.filterIdx, { label: false });
}

function perbaruiEfek(m, dt, t) {
  const ef = config.efek;

  // Mulut terbuka -> konfeti (histeresis agar tidak berkedip)
  if (ef.mulutTerbuka) {
    if (!state.mulutTerbuka && m.mulut > ef.ambangMulut) {
      state.mulutTerbuka = true;
      if (t - state.terakhirKonfeti > 1.5) {
        luncurkanKonfeti();
        state.terakhirKonfeti = t;
      }
    } else if (state.mulutTerbuka && m.mulut < ef.ambangMulut * 0.65) {
      state.mulutTerbuka = false;
    }
  }

  // Kepala miring -> goyangan dan animasi lebih kencang
  const target = ef.kepalaMiring && m.miring > ef.ambangMiringDerajat ? 2.6 : 1;
  state.boost += (target - state.boost) * Math.min(1, dt * 6);
}

// Konfeti: partikel kecil menempel di anchor dahi
const JUMLAH_KONFETI = 70;
const DURASI_KONFETI = 1.4;
const konfeti = { pts: null, vel: null, umur: 0, aktif: false };

function buatKonfeti() {
  if (konfeti.pts) return;
  const pos = new Float32Array(JUMLAH_KONFETI * 3);
  const col = new Float32Array(JUMLAH_KONFETI * 3);
  const palet = [0xffd23f, 0xee4266, 0x3bceac, 0x0ead69, 0x8e7dff].map((c) => new THREE.Color(c));
  for (let i = 0; i < JUMLAH_KONFETI; i += 1) {
    const c = palet[i % palet.length];
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: state.lebarWajah * 0.07, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true,
  });
  konfeti.pts = new THREE.Points(geo, mat);
  konfeti.pts.frustumCulled = false;
  konfeti.pts.visible = false;
  konfeti.vel = new Float32Array(JUMLAH_KONFETI * 3);
  ambilAnchor(LANDMARK.atas).group.add(konfeti.pts);
}

function luncurkanKonfeti() {
  if (!konfeti.pts) return;
  const L = state.lebarWajah;
  const pos = konfeti.pts.geometry.attributes.position.array;
  for (let i = 0; i < JUMLAH_KONFETI; i += 1) {
    const j = i * 3;
    pos[j] = (Math.random() - 0.5) * 0.3 * L;
    pos[j + 1] = 0.1 * L;
    pos[j + 2] = (Math.random() - 0.3) * 0.2 * L;
    konfeti.vel[j] = (Math.random() - 0.5) * 0.9 * L;
    konfeti.vel[j + 1] = (0.6 + Math.random() * 0.9) * L;
    konfeti.vel[j + 2] = (Math.random() - 0.3) * 0.6 * L;
  }
  konfeti.umur = 0;
  konfeti.aktif = true;
  konfeti.pts.material.opacity = 1;
  konfeti.pts.visible = true;
  konfeti.pts.geometry.attributes.position.needsUpdate = true;
}

function perbaruiKonfeti(dt) {
  if (!konfeti.aktif) return;
  konfeti.umur += dt;
  if (konfeti.umur >= DURASI_KONFETI) {
    konfeti.aktif = false;
    konfeti.pts.visible = false;
    return;
  }
  const L = state.lebarWajah;
  const pos = konfeti.pts.geometry.attributes.position.array;
  for (let i = 0; i < JUMLAH_KONFETI; i += 1) {
    const j = i * 3;
    konfeti.vel[j + 1] -= 1.8 * L * dt; // gravitasi
    pos[j] += konfeti.vel[j] * dt;
    pos[j + 1] += konfeti.vel[j + 1] * dt;
    pos[j + 2] += konfeti.vel[j + 2] * dt;
  }
  konfeti.pts.material.opacity = 1 - konfeti.umur / DURASI_KONFETI;
  konfeti.pts.geometry.attributes.position.needsUpdate = true;
}

// ---------------------------------------------------------------
// 8. FILTER: daftar, ganti, simpan terakhir
// ---------------------------------------------------------------
function bangunDaftarFilter() {
  el.daftar.innerHTML = '';
  config.filters.forEach((f, i) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', `Filter ${f.nama}`);
    b.innerHTML = `<span class="ikon">${f.ikon || '✨'}</span><span class="nama">${f.nama}</span>`;
    b.addEventListener('click', () => terapkanFilter(i));
    el.daftar.appendChild(b);
  });
}

function bacaFilterTerakhir() {
  try {
    const id = localStorage.getItem(KUNCI_FILTER);
    const i = config.filters.findIndex((f) => f.id === id);
    return i >= 0 ? i : 0;
  } catch {
    return 0;
  }
}

function terapkanFilter(i, { label = true } = {}) {
  const n = config.filters.length;
  state.filterIdx = ((i % n) + n) % n;
  const f = config.filters[state.filterIdx];

  for (const [id, a] of akses) a.offset.visible = state.siap && f.aksesori.includes(id);

  [...el.daftar.children].forEach((c, idx) => {
    const aktif = idx === state.filterIdx;
    c.setAttribute('aria-selected', String(aktif));
    if (aktif) c.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  });

  if (label) tampilLabel(`${f.ikon || ''} ${f.nama}`);
  try { localStorage.setItem(KUNCI_FILTER, f.id); } catch { /* mode privat: abaikan */ }
  if (DEBUG) isiPilihanDebug();
}

// ---------------------------------------------------------------
// 9. AMBIL FOTO — gabungkan video kamera + canvas 3D
// ---------------------------------------------------------------
function gambarLapisan(ctx, elemen, rectInduk) {
  const r = elemen.getBoundingClientRect();
  let cermin = false;
  try {
    cermin = new DOMMatrix(getComputedStyle(elemen).transform).a < 0; // kamera depan biasanya dicerminkan
  } catch { /* abaikan */ }
  ctx.save();
  const x = r.left - rectInduk.left;
  const y = r.top - rectInduk.top;
  if (cermin) {
    ctx.translate(x + r.width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(elemen, 0, 0, r.width, r.height);
  } else {
    ctx.drawImage(elemen, x, y, r.width, r.height);
  }
  ctx.restore();
}

async function ambilFoto() {
  if (!mindar?.video) return;
  const rect = el.container.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const out = document.createElement('canvas');
  out.width = Math.round(rect.width * dpr);
  out.height = Math.round(rect.height * dpr);
  const ctx = out.getContext('2d');
  ctx.scale(dpr, dpr);

  renderer.render(scene, camera); // render ulang agar buffer WebGL masih berisi frame terbaru
  gambarLapisan(ctx, mindar.video, rect);
  gambarLapisan(ctx, renderer.domElement, rect);

  const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) { toast('Gagal membuat foto'); return; }

  if (state.fotoUrl) URL.revokeObjectURL(state.fotoUrl);
  state.fotoBlob = blob;
  state.fotoUrl = URL.createObjectURL(blob);
  el.imgPratinjau.src = state.fotoUrl;
  tampil(el.pratinjau);
}

const stempel = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

const adalahIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

async function simpanFoto() {
  if (!state.fotoBlob) return;
  const nama = `filter-wisuda-${stempel()}.jpg`;
  const file = new File([state.fotoBlob], nama, { type: 'image/jpeg' });

  // iPhone: lembar bagikan memiliki "Simpan Gambar" (ke Foto). Lainnya: unduh langsung.
  if (adalahIOS() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Filter Wisuda' });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = state.fotoUrl;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast(adalahIOS() ? 'Tekan lama gambar lalu pilih "Simpan ke Foto"' : 'Foto disimpan ke folder Unduhan', 3200);
}

// ---------------------------------------------------------------
// 10. LOOP RENDER
// ---------------------------------------------------------------
function loop() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  const ada = sensor.kiri?.group.visible;
  const m = ada ? ukurWajah() : null;
  state.ukur = m;

  if (m && !state.siap) kalibrasi(m);
  if (state.siap) {
    if (m) perbaruiEfek(m, dt, t);
    for (const a of akses.values()) if (a.offset.visible) perbaruiAnimasi(a, dt, t);
    perbaruiKonfeti(dt);
  }
  if (DEBUG && state.bingkai++ % 6 === 0) perbaruiBacaanDebug();
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------
// 11. PANEL DEBUG (?debug=1) — atur titik tempel aksesori
// ---------------------------------------------------------------
const SLIDER = [
  ['posisi', 0, 'posisi X', -1.5, 1.5, 0.005],
  ['posisi', 1, 'posisi Y', -1.5, 1.5, 0.005],
  ['posisi', 2, 'posisi Z', -1.5, 1.5, 0.005],
  ['rotasiDerajat', 0, 'rotasi X', -180, 180, 1],
  ['rotasiDerajat', 1, 'rotasi Y', -180, 180, 1],
  ['rotasiDerajat', 2, 'rotasi Z', -180, 180, 1],
  ['skala', null, 'skala', 0.2, 3, 0.01],
];
let dbg = {};

function bangunPanelDebug() {
  const p = document.createElement('details');
  p.id = 'debug';
  p.open = true;
  p.innerHTML = '<summary>Panel penyetelan</summary><select id="dbg-aks"></select><div id="dbg-slider"></div><pre id="dbg-baca"></pre><button id="dbg-salin">Salin JSON aksesori</button>';
  document.body.appendChild(p);
  dbg = { select: p.querySelector('#dbg-aks'), wadah: p.querySelector('#dbg-slider'), baca: p.querySelector('#dbg-baca'), input: [] };

  SLIDER.forEach(([kunci, idx, label, min, max, step]) => {
    const l = document.createElement('label');
    l.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
    const inp = l.querySelector('input');
    const out = l.querySelector('output');
    inp.addEventListener('input', () => {
      const a = akses.get(dbg.select.value);
      if (!a) return;
      const v = parseFloat(inp.value);
      if (idx === null) a.cfg[kunci] = v; else a.cfg[kunci][idx] = v;
      out.textContent = v;
      terapkanFit(a);
    });
    dbg.wadah.appendChild(l);
    dbg.input.push({ kunci, idx, inp, out });
  });

  dbg.select.addEventListener('change', segarkanSlider);
  p.querySelector('#dbg-salin').addEventListener('click', async () => {
    const a = akses.get(dbg.select.value);
    if (!a) return;
    const teks = JSON.stringify({ [a.id]: a.cfg }, null, 2);
    try { await navigator.clipboard.writeText(teks); toast('JSON disalin'); } catch { window.prompt('Salin JSON ini:', teks); }
  });
  isiPilihanDebug();
}

function isiPilihanDebug() {
  if (!dbg.select) return;
  const f = config.filters[state.filterIdx];
  const sebelumnya = dbg.select.value;
  dbg.select.innerHTML = '';
  f.aksesori.filter((id) => akses.has(id)).forEach((id) => {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = akses.get(id).cfg.nama || id;
    dbg.select.appendChild(o);
  });
  if ([...dbg.select.options].some((o) => o.value === sebelumnya)) dbg.select.value = sebelumnya;
  segarkanSlider();
}

function segarkanSlider() {
  const a = akses.get(dbg.select.value);
  if (!a) return;
  dbg.input.forEach(({ kunci, idx, inp, out }) => {
    const v = idx === null ? a.cfg[kunci] : a.cfg[kunci][idx];
    inp.value = v;
    out.textContent = v;
  });
}

function perbaruiBacaanDebug() {
  const m = state.ukur;
  dbg.baca.textContent = m
    ? `mulut: ${m.mulut.toFixed(3)} (ambang ${config.efek.ambangMulut})\nmiring: ${m.miring.toFixed(1)}° (ambang ${config.efek.ambangMiringDerajat})\nlebar wajah: ${state.lebarWajah.toFixed(3)}  siap: ${state.siap}`
    : 'wajah tidak terdeteksi';
}

// ---------------------------------------------------------------
// 12. ALUR MULAI + EVENT
// ---------------------------------------------------------------
async function mulai() {
  sembunyi(el.mulai);
  sembunyi(el.error);
  tampil(el.memuat);
  setMemuat('Meminta izin kamera…', 0.05);

  try {
    await cekIzinKamera('user');
  } catch (err) {
    tampilkanErrorKamera(err);
    return;
  }

  try {
    if (!state.dibangun) await bangunScene();
    setMemuat('Menyalakan pelacak wajah…', 0.85);
    await mindar.start();
    renderer.setAnimationLoop(loop);
    sembunyi(el.memuat);
    tampil(el.ui);
  } catch (err) {
    console.error(err);
    tampilkanError({
      judul: 'Gagal memulai filter',
      isi: 'Model pelacak wajah atau aksesori tidak dapat dimuat. Periksa koneksi internet, pastikan file .glb ada di folder assets/models, lalu ketuk "Coba lagi".',
    });
  }
}

async function gantiKamera() {
  if (state.sibukKamera || !mindar) return;
  state.sibukKamera = true;
  const targetDepan = !mindar.shouldFaceUser;
  tampil(el.memuat);
  setMemuat('Mengganti kamera…', 0.5);
  try {
    mindar.stop(); // lepas kamera lama dulu agar kamera baru bisa dibuka
    await cekIzinKamera(targetDepan ? 'user' : 'environment');
    mindar.shouldFaceUser = targetDepan;
    await mindar.start();
  } catch (err) {
    console.warn('Ganti kamera gagal:', err);
    toast(`Kamera ${targetDepan ? 'depan' : 'belakang'} tidak bisa dibuka`, 3500);
    try {
      mindar.shouldFaceUser = !targetDepan;
      await mindar.start();
    } catch (err2) {
      tampilkanErrorKamera(err2);
    }
  } finally {
    renderer.setAnimationLoop(loop);
    sembunyi(el.memuat);
    state.sibukKamera = false;
  }
}

function tutupPratinjau() {
  sembunyi(el.pratinjau);
}

el.btnMulai.addEventListener('click', mulai);
el.btnCoba.addEventListener('click', mulai);
el.btnPrev.addEventListener('click', () => terapkanFilter(state.filterIdx - 1));
el.btnNext.addEventListener('click', () => terapkanFilter(state.filterIdx + 1));
el.btnFoto.addEventListener('click', ambilFoto);
el.btnKamera.addEventListener('click', gantiKamera);
el.btnSimpan.addEventListener('click', simpanFoto);
el.btnTutup.addEventListener('click', tutupPratinjau);

// Geser kiri/kanan pada layar untuk ganti filter
let sx = 0;
let sy = 0;
el.container.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
el.container.addEventListener('pointerup', (e) => {
  const dx = e.clientX - sx;
  const dy = e.clientY - sy;
  if (Math.abs(dx) > 70 && Math.abs(dy) < 60 && state.dibangun) terapkanFilter(state.filterIdx + (dx < 0 ? 1 : -1));
});

// Lepas kamera saat halaman ditutup
window.addEventListener('pagehide', () => {
  try { mindar?.stop(); } catch { /* abaikan */ }
});
