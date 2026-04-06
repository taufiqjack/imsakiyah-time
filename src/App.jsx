import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Container, Paper, Box, Stack, Typography, Button, IconButton, Fab,
  Tabs, Tab, Card, CardContent, TextField, CircularProgress,
  List, ListItem, ListItemText, ListItemIcon, ListItemSecondaryAction,
  Select, MenuItem, FormControl, InputLabel, Chip, Divider, Alert,
  useTheme,
} from '@mui/material'
import {
  DarkMode, LightMode, Notifications, NotificationsOff,
  ArrowBack, PlayArrow, Stop, BookmarkBorder, Bookmark,
  Search, Close, NavigateBefore, NavigateNext, MyLocation,
  VolumeUp, VolumeOff, MenuBook, AutoStories,
} from '@mui/icons-material'

const API_BASE = 'https://equran.id/api/v2/shalat'
const QURAN_API = 'https://equran.id/api/v2/surat'
const HADITH_API = 'https://api.hadith.gading.dev/books'

function App({ mode, toggleTheme }) {
  const theme = useTheme()

  // Schedule state
  const [provinces, setProvinces] = useState([])
  const [schedule, setSchedule] = useState(null)
  const [scheduleMeta, setScheduleMeta] = useState(null)
  const [selectedProvince, setSelectedProvince] = useState(null)
  const [selectedCity, setSelectedCity] = useState(null)
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(true)
  const [locationError, setLocationError] = useState(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [currentTime, setCurrentTime] = useState(new Date())
  const [playingAdhan, setPlayingAdhan] = useState(null)
  const [adhanEnabled, setAdhanEnabled] = useState(true)
  const [audioInstance, setAudioInstance] = useState(null)
  const [lastNotificationMinute, setLastNotificationMinute] = useState(null)
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1)
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())

  // Quran state
  const [activeTab, setActiveTab] = useState(0)
  const [surahList, setSurahList] = useState([])
  const [surahLoading, setSurahLoading] = useState(false)
  const [selectedSurah, setSelectedSurah] = useState(null)
  const [surahDetail, setSurahDetail] = useState(null)
  const [surahDetailLoading, setSurahDetailLoading] = useState(false)
  const [playingAyah, setPlayingAyah] = useState(null)
  const [ayahAudioInstance, setAyahAudioInstance] = useState(null)
  const [isPlayingFullSurah, setIsPlayingFullSurah] = useState(false)
  const [fullSurahAudioInstance, setFullSurahAudioInstance] = useState(null)
  const [selectedQari, setSelectedQari] = useState('01')
  const [surahSearchQuery, setSurahSearchQuery] = useState('')
  const [lastReadSurah, setLastReadSurah] = useState(null)
  const [lastReadAyah, setLastReadAyah] = useState(null)
  const [saveReadEnabled, setSaveReadEnabled] = useState(true)

  // Hadith state
  const [hadithBooks, setHadithBooks] = useState([])
  const [hadithBookLoading, setHadithBookLoading] = useState(false)
  const [selectedBook, setSelectedBook] = useState(null)
  const [hadiths, setHadiths] = useState([])
  const [hadithLoading, setHadithLoading] = useState(false)
  const [hadithSearchQuery, setHadithSearchQuery] = useState('')

  // Init from localStorage
  useEffect(() => {
    const savedAdhanEnabled = localStorage.getItem('adhanEnabled')
    if (savedAdhanEnabled !== null) setAdhanEnabled(savedAdhanEnabled === 'true')

    try {
      const s = localStorage.getItem('lastReadSurah')
      if (s) setLastReadSurah(JSON.parse(s))
    } catch {}
    try {
      const s = localStorage.getItem('lastReadAyah')
      if (s) setLastReadAyah(JSON.parse(s))
    } catch {}

    const savedSaveReadEnabled = localStorage.getItem('saveReadEnabled')
    if (savedSaveReadEnabled !== null) setSaveReadEnabled(savedSaveReadEnabled === 'true')

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Update clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch provinces
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/provinsi`)
        const data = await res.json()
        setProvinces(data.data || [])
      } catch (e) {
        console.error('Error fetching provinces:', e)
      }
    })()
  }, [])

  // Detect location after provinces loaded
  useEffect(() => {
    if (provinces.length > 0) {
      const t = setTimeout(() => detectLocation(), 2000)
      return () => clearTimeout(t)
    }
  }, [provinces])

  // Monitor geolocation permission
  useEffect(() => {
    if (!navigator.permissions) return
    navigator.permissions.query({ name: 'geolocation' }).then((ps) => {
      if (ps.state === 'granted' && !locating && (!selectedProvince || !selectedCity)) {
        detectLocation()
      }
      ps.addEventListener('change', () => {
        if (ps.state === 'granted') {
          setLocationError(null)
          detectLocation()
        }
      })
    }).catch(() => {})
  }, [locating, selectedProvince, selectedCity, provinces])

  // Auto-trigger adhan
  useEffect(() => {
    if (!adhanEnabled || !schedule || !selectedCity) return
    const now = new Date()
    const currentMinStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const minuteId = `${now.getDate()}-${now.getMonth()}-${now.getFullYear()}-${now.getHours()}-${now.getMinutes()}`
    if (lastNotificationMinute === minuteId) return

    const todayData = schedule.find(
      (item) => item.tanggal === now.getDate() && currentMonth === now.getMonth() + 1 && currentYear === now.getFullYear()
    )
    if (!todayData) return

    const prayers = [
      { name: 'Subuh', time: todayData.subuh },
      { name: 'Zuhur', time: todayData.dzuhur },
      { name: 'Asar', time: todayData.ashar },
      { name: 'Maghrib', time: todayData.maghrib },
      { name: 'Isya', time: todayData.isya },
    ]

    const matched = prayers.find((p) => p.time === currentMinStr)
    if (matched) {
      setLastNotificationMinute(minuteId)
      showNotification(matched.name, matched.time)
      toggleAdhan(matched.name)
    }
  }, [currentTime, adhanEnabled, schedule, currentMonth, currentYear, selectedCity, lastNotificationMinute])

  // Fetch schedule when province/city/month/year change
  useEffect(() => {
    if (selectedProvince && selectedCity) fetchSchedule()
  }, [selectedProvince, selectedCity, currentMonth, currentYear])

  // Fetch surah list when quran tab active
  useEffect(() => {
    if (activeTab === 1) fetchSurahList()
  }, [activeTab])

  // Fetch hadith books when hadith tab active
  useEffect(() => {
    if (activeTab === 2) fetchHadithBooks()
  }, [activeTab])

  // === API Functions ===
  const fetchSchedule = useCallback(async () => {
    if (!selectedProvince || !selectedCity) return
    setLoading(true)
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provinsi: selectedProvince,
          kabkota: selectedCity,
          bulan: currentMonth,
          tahun: currentYear,
        }),
      })
      const data = await res.json()
      if (data.data) {
        setSchedule(data.data.jadwal || [])
        setScheduleMeta({
          provinsi: data.data.provinsi,
          kabkota: data.data.kabkota,
          bulan: data.data.bulan,
          tahun: data.data.tahun,
          bulan_nama: data.data.bulan_nama,
        })
      }
    } catch (e) {
      console.error('Error fetching schedule:', e)
    } finally {
      setLoading(false)
    }
  }, [selectedProvince, selectedCity, currentMonth, currentYear])

  const fetchCities = async (province) => {
    if (!province) return []
    try {
      const res = await fetch(`${API_BASE}/kabkota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provinsi: province }),
      })
      const data = await res.json()
      return data.data || []
    } catch (e) {
      console.error('Error fetching cities:', e)
      return []
    }
  }

  const fetchSurahList = async () => {
    if (surahList.length > 0) return
    setSurahLoading(true)
    try {
      const res = await fetch(QURAN_API)
      const data = await res.json()
      if (data.data) setSurahList(data.data)
    } catch (e) {
      console.error('Error fetching surah list:', e)
    } finally {
      setSurahLoading(false)
    }
  }

  const fetchSurahDetail = async (surahId) => {
    setSurahDetailLoading(true)
    setSurahDetail(null)
    try {
      const res = await fetch(`${QURAN_API}/${surahId}`)
      const data = await res.json()
      if (data.data) setSurahDetail(data.data)
    } catch (e) {
      console.error('Error fetching surah detail:', e)
    } finally {
      setSurahDetailLoading(false)
    }
  }

  const fetchHadithBooks = async () => {
    if (hadithBooks.length > 0) return
    setHadithBookLoading(true)
    try {
      const res = await fetch(HADITH_API)
      const data = await res.json()
      if (data.data) setHadithBooks(data.data)
    } catch (e) {
      console.error('Error fetching hadith books:', e)
    } finally {
      setHadithBookLoading(false)
    }
  }

  const fetchHadithDetail = async (bookId) => {
    setHadithLoading(true)
    setHadiths([])
    try {
      const res = await fetch(`${HADITH_API}/${bookId}?range=1-100`)
      const data = await res.json()
      if (data.data && data.data.hadiths) setHadiths(data.data.hadiths)
    } catch (e) {
      console.error('Error fetching hadith detail:', e)
    } finally {
      setHadithLoading(false)
    }
  }

  // === Location Functions ===
  const detectLocation = async () => {
    setLocating(true)
    setLocationError(null)
    if (!navigator.geolocation) {
      setLocationError('Geolocation tidak didukung browser')
      setLocating(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        await reverseGeocode(latitude, longitude)
      },
      (err) => {
        setLocationError('Lokasi tidak terdeteksi')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }

  const reverseGeocode = async (lat, lon) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=id-ID`,
      )
      const data = await res.json()
      if (!data?.address) {
        setLocating(false)
        return
      }

      const { address } = data
      const candidates = [address.state, address.state_district, address.region, address.province, address.county].filter(Boolean)
      let foundProvince = null
      for (const c of candidates) {
        foundProvince = findMatchingProvince(c)
        if (foundProvince) break
      }
      if (!foundProvince) {
        setLocationError('Provinsi tidak ditemukan')
        setLocating(false)
        return
      }

      let rawCityName = null
      let cityType = null
      if (address.county) { rawCityName = address.county; cityType = 'Kab.' }
      else if (address.city) { rawCityName = address.city; cityType = 'Kota' }
      else if (address.town) { rawCityName = address.town }
      else if (address.municipality) { rawCityName = address.municipality }

      if (!rawCityName) { setLocating(false); return }

      const cityNameForMatching = cityType ? `${cityType} ${rawCityName}` : rawCityName
      await setLocation(foundProvince, cityNameForMatching)
    } catch (e) {
      console.error('Reverse geocoding error:', e)
      setLocating(false)
    }
  }

  const findMatchingProvince = (name) => {
    const normalized = name.toLowerCase()
      .replace(/^(provinsi|prov|daerah|istimewa|khusus)\s*/i, '')
      .replace(/\s+(daerah|istimewa|khusus)\s*/i, ' ')
      .trim()

    let match = provinces.find((p) => {
      const pn = p.toLowerCase().replace(/^(provinsi|prov|d\.i\.|daerah|istimewa)\s*/i, '').trim()
      return pn === normalized
    })
    if (match) return match

    match = provinces.find((p) => {
      const pn = p.toLowerCase().replace(/^(provinsi|prov|d\.i\.|daerah|istimewa)\s*/i, '').trim()
      return pn.includes(normalized) || normalized.includes(pn)
    })
    return match
  }

  const findMatchingCity = (name, citiesList) => {
    if (!name || !citiesList?.length) return null
    const normalized = name.toLowerCase()
      .replace(/^(kabupaten|kabupaten|kab|kota|city|daerah|khusus|district|regency|municipality)\s*/i, '')
      .replace(/\s+(kabupaten|kab|kota|city|daerah|khusus)\s*/i, ' ')
      .trim()

    let match = citiesList.find((c) => {
      const cn = c.toLowerCase().replace(/^kab\.?\s*/i, '').replace(/^kota\s*/i, '').trim()
      return cn === normalized
    })
    if (match) return match

    match = citiesList.find((c) => {
      const cn = c.toLowerCase().replace(/^kab\.?\s*/i, '').replace(/^kota\s*/i, '').trim()
      return cn.includes(normalized) || normalized.includes(cn)
    })
    return match
  }

  const setLocation = async (province, cityName) => {
    setSelectedProvince(province)
    const citiesList = await fetchCities(province)
    const matched = findMatchingCity(cityName, citiesList)
    const finalCity = matched || citiesList[0]
    if (finalCity) setSelectedCity(finalCity)
    setLocating(false)
  }

  // === Adhan Functions ===
  const toggleAdhanEnabled = () => {
    const val = !adhanEnabled
    setAdhanEnabled(val)
    localStorage.setItem('adhanEnabled', String(val))
    if (val && 'Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission()
    }
    if (!val && audioInstance) {
      audioInstance.pause()
      setAudioInstance(null)
      setPlayingAdhan(null)
    }
  }

  const toggleAdhan = (prayerName) => {
    if (playingAdhan === prayerName && audioInstance) {
      audioInstance.pause()
      setAudioInstance(null)
      setPlayingAdhan(null)
      return
    }
    if (audioInstance) audioInstance.pause()

    const audioUrl = prayerName === 'Subuh'
      ? 'https://rencanggunung.com/mp3/adzan_shubuh.mp3'
      : 'https://rencanggunung.com/mp3/adzan.mp3'

    setPlayingAdhan(prayerName)
    const audio = new Audio(audioUrl)
    audio.addEventListener('ended', () => { setAudioInstance(null); setPlayingAdhan(null) })
    audio.addEventListener('error', () => { setAudioInstance(null); setPlayingAdhan(null) })
    setAudioInstance(audio)
    audio.play().catch(() => { setAudioInstance(null); setPlayingAdhan(null) })
  }

  const showNotification = (prayerName, time) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`Waktu ${prayerName} telah tiba`, {
        body: `Waktu ${prayerName} untuk wilayah ${selectedCity} adalah pukul ${time}`,
        icon: '/imsakiyah.png',
      })
    }
  }

  // === Save Read Functions ===
  const toggleSaveReadEnabled = () => {
    const val = !saveReadEnabled
    setSaveReadEnabled(val)
    localStorage.setItem('saveReadEnabled', String(val))
    if (!val) {
      localStorage.removeItem('lastReadSurah')
      localStorage.removeItem('lastReadAyah')
      setLastReadSurah(null)
      setLastReadAyah(null)
    }
  }

  // === Quran Functions ===
  const handleSurahClick = (surah) => {
    setSelectedSurah(surah)
    fetchSurahDetail(surah.nomor)
    if (saveReadEnabled) {
      const d = { nomor: surah.nomor, namaLatin: surah.namaLatin, nama: surah.nama, arti: surah.arti, timestamp: Date.now() }
      localStorage.setItem('lastReadSurah', JSON.stringify(d))
      setLastReadSurah(d)
    }
  }

  const handleSaveAyah = (ayah) => {
    const isSaved = lastReadAyah?.nomorAyat === ayah.nomorAyat && lastReadAyah?.surahNomor === selectedSurah?.nomor
    if (isSaved) {
      localStorage.removeItem('lastReadAyah')
      setLastReadAyah(null)
    } else {
      const d = { surahNomor: selectedSurah?.nomor, nomorAyat: ayah.nomorAyat, teksArab: ayah.teksArab, teksLatin: ayah.teksLatin, timestamp: Date.now() }
      localStorage.setItem('lastReadAyah', JSON.stringify(d))
      setLastReadAyah(d)
    }
  }

  const handleBackToList = () => {
    if (ayahAudioInstance) { ayahAudioInstance.pause(); setAyahAudioInstance(null); setPlayingAyah(null) }
    if (fullSurahAudioInstance) { fullSurahAudioInstance.pause(); setFullSurahAudioInstance(null); setIsPlayingFullSurah(false) }
    setSelectedSurah(null)
    setSurahDetail(null)
  }

  const handleBookClick = (book) => {
    setSelectedBook(book)
    fetchHadithDetail(book.id)
  }

  const handleBackToBookList = () => {
    setSelectedBook(null)
    setHadiths([])
  }

  const toggleFullSurahAudio = () => {
    if (isPlayingFullSurah && fullSurahAudioInstance) {
      fullSurahAudioInstance.pause()
      setFullSurahAudioInstance(null)
      setIsPlayingFullSurah(false)
      return
    }
    if (ayahAudioInstance) { ayahAudioInstance.pause(); setAyahAudioInstance(null); setPlayingAyah(null) }
    if (fullSurahAudioInstance) fullSurahAudioInstance.pause()

    if (surahDetail?.audioFull?.[selectedQari]) {
      const audio = new Audio(surahDetail.audioFull[selectedQari])
      setIsPlayingFullSurah(true)
      audio.addEventListener('ended', () => { setFullSurahAudioInstance(null); setIsPlayingFullSurah(false) })
      audio.addEventListener('error', () => { setFullSurahAudioInstance(null); setIsPlayingFullSurah(false) })
      setFullSurahAudioInstance(audio)
      audio.play().catch(() => { setFullSurahAudioInstance(null); setIsPlayingFullSurah(false) })
    }
  }

  const toggleAyahAudio = (ayah) => {
    if (playingAyah === ayah.nomorAyat && ayahAudioInstance) {
      ayahAudioInstance.pause()
      setAyahAudioInstance(null)
      setPlayingAyah(null)
      return
    }
    if (ayahAudioInstance) ayahAudioInstance.pause()
    if (isPlayingFullSurah && fullSurahAudioInstance) { fullSurahAudioInstance.pause(); setFullSurahAudioInstance(null); setIsPlayingFullSurah(false) }

    if (ayah.audio?.[selectedQari]) {
      const audio = new Audio(ayah.audio[selectedQari])
      setPlayingAyah(ayah.nomorAyat)
      audio.addEventListener('ended', () => { setAyahAudioInstance(null); setPlayingAyah(null) })
      audio.addEventListener('error', () => { setAyahAudioInstance(null); setPlayingAyah(null) })
      setAyahAudioInstance(audio)
      audio.play().catch(() => { setAyahAudioInstance(null); setPlayingAyah(null) })
    }
  }

  // === Navigation ===
  const navigateDate = (days) => {
    const d = new Date(currentDate)
    d.setDate(d.getDate() + days)
    setCurrentDate(d)
    const newMonth = d.getMonth() + 1
    const newYear = d.getFullYear()
    if (newMonth !== currentMonth || newYear !== currentYear) {
      setCurrentMonth(newMonth)
      setCurrentYear(newYear)
    }
  }

  // === Utility ===
  const parseTime = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number)
    return h * 60 + m
  }

  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

  const todaySchedule = useMemo(() => {
    if (!schedule?.length) return null
    return schedule.find((item) => item.tanggal === currentDate.getDate())
  }, [schedule, currentDate])

  const currentMinutes = useMemo(() => currentTime.getHours() * 60 + currentTime.getMinutes(), [currentTime])

  const getNextPrayer = useMemo(() => {
    if (!todaySchedule) return null
    const prayers = [
      { name: 'Imsak', time: todaySchedule.imsak },
      { name: 'Subuh', time: todaySchedule.subuh },
      { name: 'Terbit', time: todaySchedule.terbit },
      { name: 'Dhuha', time: todaySchedule.dhuha },
      { name: 'Zuhur', time: todaySchedule.dzuhur },
      { name: 'Asar', time: todaySchedule.ashar },
      { name: 'Maghrib', time: todaySchedule.maghrib },
      { name: 'Isya', time: todaySchedule.isya },
    ]
    return prayers.find((p) => parseTime(p.time) > currentMinutes) || null
  }, [todaySchedule, currentMinutes])

  const prayerCountdown = useMemo(() => {
    if (!getNextPrayer) return null
    const [ph, pm] = getNextPrayer.time.split(':').map(Number)
    const pSec = ph * 3600 + pm * 60
    const cSec = currentTime.getHours() * 3600 + currentTime.getMinutes() * 60 + currentTime.getSeconds()
    const diff = pSec - cSec
    if (diff <= 0) return null
    return {
      hours: Math.floor(diff / 3600),
      minutes: Math.floor((diff % 3600) / 60),
      seconds: diff % 60,
    }
  }, [getNextPrayer, currentTime])

  const formatCountdown = (cd) => {
    if (!cd) return '--:--:--'
    return `${String(cd.hours).padStart(2, '0')}:${String(cd.minutes).padStart(2, '0')}:${String(cd.seconds).padStart(2, '0')}`
  }

  const isToday = (date) => {
    const t = new Date()
    return date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear()
  }

  const filteredSurahList = useMemo(() => {
    if (!surahSearchQuery) return surahList
    const q = surahSearchQuery.toLowerCase()
    return surahList.filter(
      (s) => s.namaLatin.toLowerCase().includes(q) || s.arti.toLowerCase().includes(q) || s.nama.toLowerCase().includes(q),
    )
  }, [surahList, surahSearchQuery])

  const filteredHadithBooks = useMemo(() => {
    if (!hadithSearchQuery) return hadithBooks
    const q = hadithSearchQuery.toLowerCase()
    return hadithBooks.filter((b) => b.name.toLowerCase().includes(q))
  }, [hadithBooks, hadithSearchQuery])

  // === RENDER ===
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: 3 }}>
      {/* Fixed action buttons */}
      <Box sx={{ position: 'fixed', top: 16, right: 16, zIndex: 1000, display: 'flex', gap: 1 }}>
        {activeTab === 0 && (
          <Fab size="small" color={adhanEnabled ? 'primary' : 'default'} onClick={toggleAdhanEnabled}>
            {adhanEnabled ? <Notifications /> : <NotificationsOff />}
          </Fab>
        )}
        {activeTab === 1 && (
          <Fab size="small" color={saveReadEnabled ? 'warning' : 'default'} onClick={toggleSaveReadEnabled}>
            <Bookmark />
          </Fab>
        )}
        <Fab size="small" color="default" onClick={toggleTheme}>
          {mode === 'dark' ? <LightMode /> : <DarkMode />}
        </Fab>
      </Box>

      <Container maxWidth="sm" sx={{ pt: 2 }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', py: 4, color: 'text.primary' }}>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
            Jadwal Sholat
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Waktu Sholat & Imsakiyah
          </Typography>
          {scheduleMeta && activeTab === 0 && (
            <Chip label={`${scheduleMeta.bulan_nama} ${scheduleMeta.tahun}`} sx={{ mt: 1 }} size="small" color="primary" variant="outlined" />
          )}
          {selectedCity && selectedProvince && activeTab === 0 && (
            <Box sx={{ mt: 1 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<MyLocation />}
                onClick={detectLocation}
                disabled={locating}
              >
                {locating ? 'Mendeteksi...' : `${selectedCity}, ${selectedProvince}`}
              </Button>
            </Box>
          )}
        </Box>

        {/* Tabs */}
        <Paper sx={{ mb: 2 }}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            variant="fullWidth"
          >
            <Tab icon={<span style={{ fontSize: '1rem' }}>&#x1F54A;</span>} label="Jadwal" iconPosition="start" />
            <Tab icon={<MenuBook />} label="Al Qur'an" iconPosition="start" />
            <Tab icon={<AutoStories />} label="Hadits" iconPosition="start" />
          </Tabs>
        </Paper>

        {/* Schedule Tab */}
        {activeTab === 0 && (
          <>
            {locating && (
              <Paper sx={{ p: 3, mb: 2, textAlign: 'center' }}>
                <CircularProgress size={32} sx={{ mb: 1 }} />
                <Typography>Mendeteksi lokasi Anda...</Typography>
              </Paper>
            )}

            {locationError && !locating && (
              <Alert severity="warning" sx={{ mb: 2 }} action={
                <Button color="inherit" size="small" onClick={detectLocation}>Coba Lagi</Button>
              }>
                {locationError}
              </Alert>
            )}

            {schedule?.length > 0 && (
              <Paper sx={{ p: 2, mb: 2 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <IconButton onClick={() => navigateDate(-1)}><NavigateBefore /></IconButton>
                  <Box sx={{ textAlign: 'center', flex: 1 }}>
                    {isToday(currentDate) && (
                      <Chip label="Hari ini" color="success" size="small" sx={{ mb: 0.5 }} />
                    )}
                    <Typography variant="body1" fontWeight={600}>
                      {days[currentDate.getDay()]}, {currentDate.getDate()} {months[currentDate.getMonth()]} {currentDate.getFullYear()}
                    </Typography>
                  </Box>
                  <IconButton onClick={() => navigateDate(1)}><NavigateNext /></IconButton>
                </Stack>
              </Paper>
            )}

            {todaySchedule && (
              <Paper
                sx={{
                  p: 3, mb: 2, textAlign: 'center',
                  background: theme.palette.mode === 'dark'
                    ? 'linear-gradient(135deg, #1a237e 0%, #4a148c 100%)'
                    : 'linear-gradient(135deg, #1565c0 0%, #7b1fa2 100%)',
                  color: 'white',
                }}
              >
                <Typography variant="body2" sx={{ opacity: 0.9, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Waktu Sekarang
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 800, fontFamily: 'monospace', my: 1 }}>
                  {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </Typography>
                {getNextPrayer && (
                  <Typography variant="body1" sx={{ mt: 1 }}>
                    Menuju {getNextPrayer.name}: <strong style={{ fontFamily: 'monospace', fontSize: '1.25rem' }}>{formatCountdown(prayerCountdown)}</strong>
                  </Typography>
                )}
              </Paper>
            )}

            {loading && (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress />
                <Typography sx={{ mt: 1 }}>Memuat jadwal...</Typography>
              </Box>
            )}

            {todaySchedule && !loading && (
              <Stack spacing={1}>
                {[
                  { name: 'Imsak', key: 'imsak' },
                  { name: 'Subuh', key: 'subuh' },
                  { name: 'Terbit', key: 'terbit' },
                  { name: 'Dhuha', key: 'dhuha' },
                  { name: 'Zuhur', key: 'dzuhur' },
                  { name: 'Asar', key: 'ashar' },
                  { name: 'Maghrib', key: 'maghrib' },
                  { name: 'Isya', key: 'isya' },
                ].map(({ name, key }) => (
                  <PrayerTimeRow
                    key={name}
                    name={name}
                    time={todaySchedule[key]}
                    isActive={getNextPrayer?.name === name}
                    currentMinutes={currentMinutes}
                    hasAdhan={['Subuh', 'Zuhur', 'Asar', 'Maghrib', 'Isya'].includes(name) && adhanEnabled}
                    isPlaying={playingAdhan === name}
                    onToggleAdhan={() => toggleAdhan(name)}
                  />
                ))}
              </Stack>
            )}
          </>
        )}

        {/* Quran Tab */}
        {activeTab === 1 && (
          <>
            {!selectedSurah ? (
              <>
                <Paper sx={{ p: 2, mb: 2, textAlign: 'center', bgcolor: 'primary.main', color: 'white' }}>
                  <Typography variant="h5">Daftar Surat Al Qur'an</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>114 Surat dalam Al Qur'an</Typography>
                </Paper>

                <Box sx={{ mb: 2, position: 'relative' }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Cari surah..."
                    value={surahSearchQuery}
                    onChange={(e) => setSurahSearchQuery(e.target.value)}
                    InputProps={{
                      startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />,
                      endAdornment: surahSearchQuery && (
                        <IconButton size="small" onClick={() => setSurahSearchQuery('')}>
                          <Close fontSize="small" />
                        </IconButton>
                      ),
                    }}
                  />
                </Box>

                {saveReadEnabled && lastReadSurah && !surahSearchQuery && (
                  <Card
                    sx={{
                      mb: 2, cursor: 'pointer', border: 2, borderColor: 'success.main',
                      '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
                    }}
                    onClick={() => {
                      const s = surahList.find((x) => x.nomor === lastReadSurah.nomor)
                      if (s) handleSurahClick(s)
                    }}
                  >
                    <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Chip label={lastReadSurah.nomor} color="success" size="small" sx={{ fontWeight: 700 }} />
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          {lastReadSurah.namaLatin} {lastReadAyah ? `- Ayat ${lastReadAyah.nomorAyat}` : ''}
                        </Typography>
                        <Typography variant="body2" sx={{ fontFamily: "'Amiri', serif", direction: 'rtl' }}>
                          {lastReadSurah.nama}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                )}

                {surahLoading && (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <CircularProgress />
                    <Typography sx={{ mt: 1 }}>Memuat daftar surat...</Typography>
                  </Box>
                )}

                {!surahLoading && filteredSurahList.length > 0 && (
                  <Stack spacing={1}>
                    {filteredSurahList.map((surah) => (
                      <Card
                        key={surah.nomor}
                        sx={{ cursor: 'pointer', '&:hover': { transform: 'translateX(4px)', boxShadow: 2 } }}
                        onClick={() => handleSurahClick(surah)}
                      >
                        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Chip label={surah.nomor} color="primary" size="small" sx={{ fontWeight: 700, minWidth: 40 }} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="body2" fontWeight={600}>{surah.namaLatin}</Typography>
                              <Typography variant="body2" sx={{ fontFamily: "'Amiri', serif", direction: 'rtl' }}>{surah.nama}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.25 }}>
                              <Typography variant="caption" color="text.secondary">{surah.arti}</Typography>
                              <Typography variant="caption" color="text.secondary">{surah.jumlahAyat} Ayat</Typography>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                )}

                {!surahLoading && filteredSurahList.length === 0 && surahSearchQuery && (
                  <Typography sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
                    Tidak ada surat yang cocok dengan &quot;{surahSearchQuery}&quot;
                  </Typography>
                )}
              </>
            ) : (
              <>
                <Paper
                  sx={{
                    p: 2, mb: 2, color: 'white',
                    background: theme.palette.mode === 'dark'
                      ? 'linear-gradient(135deg, #1a237e 0%, #4a148c 100%)'
                      : 'linear-gradient(135deg, #1565c0 0%, #7b1fa2 100%)',
                  }}
                >
                  <Button startIcon={<ArrowBack />} onClick={handleBackToList} sx={{ color: 'white', mb: 1 }}>
                    Kembali
                  </Button>
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
                      <Chip label={selectedSurah.nomor} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 700 }} />
                      <Box sx={{ textAlign: 'left' }}>
                        <Typography variant="h6" sx={{ color: 'white' }}>{selectedSurah.namaLatin}</Typography>
                        <Typography variant="h6" sx={{ color: 'white', fontFamily: "'Amiri', serif", direction: 'rtl' }}>{selectedSurah.nama}</Typography>
                      </Box>
                    </Box>
                    <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.9 }}>
                      {selectedSurah.arti} &bull; {selectedSurah.jumlahAyat} Ayat &bull; {selectedSurah.tempatTurun}
                    </Typography>
                  </Box>

                  {surahDetail?.audioFull && (
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                      <FormControl size="small" sx={{ mb: 1, minWidth: 200, margin: '0 auto', display: 'block' }}>
                        <Select
                          value={selectedQari}
                          onChange={(e) => {
                            setSelectedQari(e.target.value)
                            if (isPlayingFullSurah && fullSurahAudioInstance) {
                              fullSurahAudioInstance.pause()
                              setFullSurahAudioInstance(null)
                              setIsPlayingFullSurah(false)
                            }
                          }}
                          sx={{ color: 'white', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' }, '& .MuiSvgIcon-root': { color: 'white' } }}
                        >
                          <MenuItem value="01">Abdullah Al-Juhany</MenuItem>
                          <MenuItem value="02">Abdul Muhsin Al-Qasim</MenuItem>
                          <MenuItem value="03">Abdurrahman as-Sudais</MenuItem>
                          <MenuItem value="04">Ibrahim Al-Dossari</MenuItem>
                          <MenuItem value="05">Misyari Rashid Al-Afasy</MenuItem>
                        </Select>
                      </FormControl>
                      <Box sx={{ textAlign: 'center' }}>
                        <Button
                          variant="contained"
                          color={isPlayingFullSurah ? 'success' : 'primary'}
                          startIcon={isPlayingFullSurah ? <Stop /> : <PlayArrow />}
                          onClick={toggleFullSurahAudio}
                          sx={{ textTransform: 'none' }}
                        >
                          {isPlayingFullSurah ? 'Pause Surat' : 'Putar Surat Penuh'}
                        </Button>
                      </Box>
                    </Box>
                  )}
                </Paper>

                {surahDetailLoading && (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <CircularProgress />
                    <Typography sx={{ mt: 1 }}>Memuat ayat...</Typography>
                  </Box>
                )}

                {!surahDetailLoading && surahDetail && (
                  <Stack spacing={1.5}>
                    {surahDetail.nomor !== 1 && surahDetail.nomor !== 9 && (
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'secondary.main', color: 'white' }}>
                        <Typography sx={{ fontFamily: "'Amiri', serif", direction: 'rtl', fontSize: '1.5rem' }}>
                          بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.9 }}>
                          Dengan nama Allah Yang Maha Pengasih, Maha Penyayang
                        </Typography>
                      </Paper>
                    )}

                    {surahDetail.ayat?.map((ayah) => (
                      <Card
                        key={ayah.nomorAyat}
                        sx={{
                          ...(playingAyah === ayah.nomorAyat && { border: 2, borderColor: 'success.main' }),
                        }}
                      >
                        <CardContent>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Chip label={ayah.nomorAyat} color="primary" size="small" />
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              {saveReadEnabled && (
                                <IconButton size="small" onClick={() => handleSaveAyah(ayah)} color={lastReadAyah?.nomorAyat === ayah.nomorAyat && lastReadAyah?.surahNomor === selectedSurah?.nomor ? 'warning' : 'default'}>
                                  {lastReadAyah?.nomorAyat === ayah.nomorAyat && lastReadAyah?.surahNomor === selectedSurah?.nomor ? <Bookmark /> : <BookmarkBorder />}
                                </IconButton>
                              )}
                              {ayah.audio?.[selectedQari] && (
                                <IconButton
                                  size="small"
                                  onClick={() => toggleAyahAudio(ayah)}
                                  color={playingAyah === ayah.nomorAyat ? 'success' : 'default'}
                                >
                                  {playingAyah === ayah.nomorAyat ? <Stop /> : <PlayArrow />}
                                </IconButton>
                              )}
                            </Box>
                          </Box>
                          <Typography
                            sx={{
                              fontFamily: "'Amiri', serif", fontSize: '1.5rem', lineHeight: 2.2,
                              textAlign: 'right', direction: 'rtl', mb: 1, wordSpacing: '0.15em',
                            }}
                          >
                            {ayah.teksArab}
                          </Typography>
                          <Paper variant="outlined" sx={{ p: 1, mb: 1, bgcolor: 'action.hover', borderLeft: 3, borderColor: 'primary.main' }}>
                            <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                              {ayah.teksLatin}
                            </Typography>
                          </Paper>
                          <Typography variant="body2" color="text.secondary">
                            {ayah.teksIndonesia}
                          </Typography>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                )}
              </>
            )}
          </>
        )}

        {/* Hadith Tab */}
        {activeTab === 2 && (
          <>
            {!selectedBook ? (
              <>
                <Paper sx={{ p: 2, mb: 2, textAlign: 'center', bgcolor: 'secondary.main', color: 'white' }}>
                  <Typography variant="h5">Kumpulan Hadits</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Kitab-kitab Hadits Utama</Typography>
                </Paper>

                <Box sx={{ mb: 2, position: 'relative' }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Cari kitab..."
                    value={hadithSearchQuery}
                    onChange={(e) => setHadithSearchQuery(e.target.value)}
                    InputProps={{
                      startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />,
                      endAdornment: hadithSearchQuery && (
                        <IconButton size="small" onClick={() => setHadithSearchQuery('')}>
                          <Close fontSize="small" />
                        </IconButton>
                      ),
                    }}
                  />
                </Box>

                {hadithBookLoading && (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <CircularProgress />
                    <Typography sx={{ mt: 1 }}>Memuat daftar kitab...</Typography>
                  </Box>
                )}

                {!hadithBookLoading && filteredHadithBooks.length > 0 && (
                  <Stack spacing={1}>
                    {filteredHadithBooks.map((book) => (
                      <Card
                        key={book.id}
                        sx={{ cursor: 'pointer', '&:hover': { transform: 'translateX(4px)', boxShadow: 2 } }}
                        onClick={() => handleBookClick(book)}
                      >
                        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="body1" fontWeight={600}>{book.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{book.available} Hadits tersedia</Typography>
                          </Box>
                          <NavigateNext color="action" />
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                )}
              </>
            ) : (
              <>
                <Paper
                  sx={{
                    p: 2, mb: 2, color: 'white',
                    background: theme.palette.mode === 'dark'
                      ? 'linear-gradient(135deg, #1b5e20 0%, #33691e 100%)'
                      : 'linear-gradient(135deg, #2e7d32 0%, #558b2f 100%)',
                  }}
                >
                  <Button startIcon={<ArrowBack />} onClick={handleBackToBookList} sx={{ color: 'white', mb: 1 }}>
                    Kembali
                  </Button>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{selectedBook.name}</Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>Menampilkan 100 hadits pertama</Typography>
                  </Box>
                </Paper>

                {hadithLoading && (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <CircularProgress />
                    <Typography sx={{ mt: 1 }}>Memuat hadits...</Typography>
                  </Box>
                )}

                {!hadithLoading && hadiths.length > 0 && (
                  <Stack spacing={1.5}>
                    {hadiths.map((hadith) => (
                      <Card key={hadith.number}>
                        <CardContent>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Chip label={`Hadits #${hadith.number}`} color="success" size="small" variant="outlined" />
                          </Box>
                          <Typography
                            sx={{
                              fontFamily: "'Amiri', serif", fontSize: '1.4rem', lineHeight: 2,
                              textAlign: 'right', direction: 'rtl', mb: 2,
                            }}
                          >
                            {hadith.arab}
                          </Typography>
                          <Divider sx={{ my: 1.5, opacity: 0.5 }} />
                          <Typography variant="body2" sx={{ color: 'text.primary', lineHeight: 1.6 }}>
                            {hadith.id}
                          </Typography>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                )}
              </>
            )}
          </>
        )}

        {/* Footer */}
        <Typography variant="body2" sx={{ textAlign: 'center', py: 2, color: 'text.secondary' }}>
          Copyright <a href="https://cahyonoz.my.id" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}>cahyonozdev</a>
        </Typography>
      </Container>
    </Box>
  )
}

function PrayerTimeRow({ name, time, isActive, currentMinutes, hasAdhan, isPlaying, onToggleAdhan }) {
  const theme = useTheme()
  const [hours, minutes] = time.split(':').map(Number)
  const prayerMinutes = hours * 60 + minutes
  const isPassed = prayerMinutes < currentMinutes

  return (
    <Card
      sx={{
        ...(isActive && {
          background: theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)'
            : 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)',
          color: 'white',
          boxShadow: 4,
          transform: 'scale(1.02)',
        }),
        ...(isPassed && !isActive && { opacity: 0.4 }),
        ...(isPlaying && {
          background: 'linear-gradient(135deg, #2e7d32 0%, #43a047 100%)',
          color: 'white',
        }),
      }}
    >
      <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body1" fontWeight={600}>{name}</Typography>
          {hasAdhan && (
            <IconButton size="small" onClick={onToggleAdhan} sx={{ color: isActive || isPlaying ? 'white' : undefined }}>
              {isPlaying ? <VolumeOff /> : <VolumeUp />}
            </IconButton>
          )}
        </Box>
        <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>{time}</Typography>
      </CardContent>
    </Card>
  )
}

export default App
