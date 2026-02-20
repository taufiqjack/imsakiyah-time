import { useState, useEffect, useMemo } from 'react'
import './App.css'

const API_BASE = 'https://equran.id/api/v2/imsakiyah'

function App() {
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
  const [ramadanStartDate, setRamadanStartDate] = useState(null)
  const [darkMode, setDarkMode] = useState(false)
  const [playingAdhan, setPlayingAdhan] = useState(null)
  const [adhanEnabled, setAdhanEnabled] = useState(true)
  const [audioInstance, setAudioInstance] = useState(null)
  const [lastNotificationMinute, setLastNotificationMinute] = useState(null)

  // Initialize dark mode from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches

    if (savedTheme) {
      setDarkMode(savedTheme === 'dark')
      document.documentElement.setAttribute('data-theme', savedTheme)
    } else if (prefersDark) {
      setDarkMode(true)
      document.documentElement.setAttribute('data-theme', 'dark')
    }

    // Initialize adhan enabled from localStorage
    const savedAdhanEnabled = localStorage.getItem('adhanEnabled')
    if (savedAdhanEnabled !== null) {
      setAdhanEnabled(savedAdhanEnabled === 'true')
    }

    // Request notification permission on app load
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('🔔 Notification permission on load:', permission)
      })
    }
  }, [])

  // Toggle dark mode
  const toggleDarkMode = () => {
    const newMode = !darkMode
    setDarkMode(newMode)
    document.documentElement.setAttribute('data-theme', newMode ? 'dark' : 'light')
    localStorage.setItem('theme', newMode ? 'dark' : 'light')
  }

  // Toggle adhan enabled/disabled (Master Toggle)
  const toggleAdhanEnabled = () => {
    const newValue = !adhanEnabled
    setAdhanEnabled(newValue)
    localStorage.setItem('adhanEnabled', String(newValue))

    // Request notification permission when enabling
    if (newValue && 'Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission().then(permission => {
        console.log('🔔 Notification permission:', permission)
      })
    }

    // Stop any playing adhan when disabling
    if (!newValue && audioInstance) {
      audioInstance.pause()
      setAudioInstance(null)
      setPlayingAdhan(null)
    }
  }

  // Toggle play/stop adhan for specific prayer time
  const toggleAdhan = (prayerName) => {
    // If clicking on the currently playing adhan, stop it
    if (playingAdhan === prayerName && audioInstance) {
      audioInstance.pause()
      setAudioInstance(null)
      setPlayingAdhan(null)
      console.log(`⏹️ Stopped adhan for ${prayerName}`)
      return
    }

    // Stop any currently playing adhan first
    if (audioInstance) {
      audioInstance.pause()
      setAudioInstance(null)
    }

    // Use special adhan for Subuh, regular for others
    const audioUrl = prayerName === 'Subuh'
      ? 'https://rencanggunung.com/mp3/adzan_shubuh.mp3'
      : 'https://rencanggunung.com/mp3/adzan.mp3'

    console.log(`🕌 Playing adhan for ${prayerName}...`)
    setPlayingAdhan(prayerName)

    const audio = new Audio(audioUrl)

    audio.addEventListener('ended', () => {
      console.log(`✅ Adhan for ${prayerName} finished`)
      setAudioInstance(null)
      setPlayingAdhan(null)
    })

    audio.addEventListener('error', (e) => {
      console.error(`❌ Error playing adhan for ${prayerName}:`, e)
      setAudioInstance(null)
      setPlayingAdhan(null)
    })

    setAudioInstance(audio)
    audio.play().catch(err => {
      console.error(`❌ Failed to play adhan for ${prayerName}:`, err)
      setAudioInstance(null)
      setPlayingAdhan(null)
    })
  }

  // Show system notification
  const showNotification = (prayerName, time) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`Waktu ${prayerName} telah tiba`, {
        body: `Waktu ${prayerName} untuk wilayah ${selectedCity} adalah pukul ${time}`,
        icon: '/imsakiyah.png'
      })
    }
  }

  // Fetch provinces on mount
  useEffect(() => {
    fetchProvinces()
  }, [])

  // Detect user location after provinces are loaded (with delay)
  useEffect(() => {
    if (provinces.length > 0) {
      const delayTimer = setTimeout(() => {
        console.log('⏰ Delay complete, starting location detection...')
        detectLocation()
      }, 2000) // 2 seconds delay

      return () => clearTimeout(delayTimer)
    }
  }, [provinces])

  // Monitor location permission changes and auto-reload when allowed
  useEffect(() => {
    // Check if browser supports permission API for geolocation
    if (navigator.permissions) {
      const checkPermission = () => {
        navigator.permissions.query({ name: 'geolocation' }).then(permissionStatus => {
          console.log('📍 Geolocation permission state:', permissionStatus.state)

          // If permission is granted, try to detect location again
          if (permissionStatus.state === 'granted') {
            console.log('✅ Location permission granted, auto-detecting location...')
            // Only detect if we're not already locating or don't have a location set
            if (!locating && (!selectedProvince || !selectedCity)) {
              detectLocation()
            }
          }

          // Listen for permission changes
          permissionStatus.addEventListener('change', () => {
            console.log('📍 Geolocation permission changed to:', permissionStatus.state)
            if (permissionStatus.state === 'granted') {
              console.log('✅ Location permission newly granted, reloading data...')
              setLocationError(null)
              detectLocation()
            }
          })
        }).catch(err => {
          console.log('⚠️ Permission API not fully supported:', err)
        })
      }

      checkPermission()
    }
  }, [locating, selectedProvince, selectedCity, provinces])

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Auto-trigger adhan when prayer time is reached
  useEffect(() => {
    if (!adhanEnabled || !schedule || !selectedCity) return

    const now = new Date()
    const currentMinStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    // Unique identifier for this minute to prevent multiple triggers
    const minuteId = `${now.getDate()}-${now.getMonth()}-${now.getFullYear()}-${now.getHours()}-${now.getMinutes()}`

    if (lastNotificationMinute === minuteId) return

    // Get today's schedule
    const diffTime = currentDate - ramadanStartDate
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1
    const todayScheduleData = schedule.find(item => item.tanggal === diffDays)

    if (!todayScheduleData) return

    const prayers = [
      { name: 'Subuh', time: todayScheduleData.subuh, hasAdhan: true },
      { name: 'Zuhur', time: todayScheduleData.dzuhur, hasAdhan: true },
      { name: 'Asar', time: todayScheduleData.ashar, hasAdhan: true },
      { name: 'Maghrib', time: todayScheduleData.maghrib, hasAdhan: true },
      { name: 'Isya', time: todayScheduleData.isya, hasAdhan: true }
    ]

    const matchedPrayer = prayers.find(p => p.time === currentMinStr)

    if (matchedPrayer) {
      console.log(`⏰ Time match found for ${matchedPrayer.name} at ${currentMinStr}`)
      setLastNotificationMinute(minuteId)

      // Show visual notification
      showNotification(matchedPrayer.name, matchedPrayer.time)

      // Play audio if it has adhan
      if (matchedPrayer.hasAdhan) {
        toggleAdhan(matchedPrayer.name)
      }
    }
  }, [currentTime, adhanEnabled, schedule, ramadanStartDate, currentDate, selectedCity, lastNotificationMinute])

  // Fetch schedule when province and city are selected
  useEffect(() => {
    if (selectedProvince && selectedCity) {
      fetchSchedule()
    }
  }, [selectedProvince, selectedCity])

  // API Functions
  const fetchProvinces = async () => {
    try {
      const response = await fetch(`${API_BASE}/provinsi`)
      const data = await response.json()
      setProvinces(data.data || [])
    } catch (error) {
      console.error('Error fetching provinces:', error)
    }
  }

  const fetchCities = async (province) => {
    if (!province) {
      return []
    }
    try {
      const response = await fetch(`${API_BASE}/kabkota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provinsi: province })
      })
      const data = await response.json()
      return data.data || []
    } catch (error) {
      console.error('Error fetching cities:', error)
      return []
    }
  }

  const fetchSchedule = async () => {
    if (!selectedProvince || !selectedCity) return

    setLoading(true)
    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provinsi: selectedProvince,
          kabkota: selectedCity
        })
      })
      const data = await response.json()

      if (data.data) {
        setSchedule(data.data.imsakiyah || [])
        setScheduleMeta({
          provinsi: data.data.provinsi,
          kabkota: data.data.kabkota,
          hijriah: data.data.hijriah,
          masehi: data.data.masehi
        })
        // Ramadan starts on February 19, 2026 for 1447 H
        setRamadanStartDate(new Date(2026, 1, 19))
      }
    } catch (error) {
      console.error('Error fetching schedule:', error)
    } finally {
      setLoading(false)
    }
  }

  // Location Functions
  const detectLocation = async () => {
    console.log('📍 Starting GPS location detection...')
    setLocating(true)
    setLocationError(null)

    if (!navigator.geolocation) {
      console.error('❌ Geolocation not supported')
      setLocationError('Geolocation tidak didukung browser')
      setDefaultLocation()
      return
    }

    console.log('✅ Geolocation supported, requesting position...')
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        console.log(`📍 GPS Position obtained: ${latitude}, ${longitude}`)
        console.log('🔍 Starting reverse geocoding...')
        await reverseGeocode(latitude, longitude)
      },
      (error) => {
        console.error('❌ Geolocation error:', error.message, error.code)
        setLocationError('Lokasi tidak terdeteksi, menggunakan Jakarta')
        setDefaultLocation()
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  const reverseGeocode = async (lat, lon) => {
    try {
      console.log(`🌐 Fetching from Nominatim: lat=${lat}, lon=${lon}`)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=id-ID`
      )
      const data = await response.json()
      console.log('📦 Nominatim response:', data)

      if (data?.address) {
        const { address } = data
        let foundProvince = null

        console.log('🏙️ Address fields:', address)

        // Find province - check multiple fields
        const provinceCandidates = [
          address.state,
          address.state_district,
          address.region,
          address.province,
          address.county, // Some Indonesian regions use county for regency
        ].filter(Boolean)

        console.log('🔍 Province candidates:', provinceCandidates)

        for (const candidate of provinceCandidates) {
          foundProvince = findMatchingProvince(candidate)
          if (foundProvince) {
            console.log(`✅ Matched province: "${candidate}" -> "${foundProvince}"`)
            break
          }
        }

        if (!foundProvince) {
          console.error('❌ Province not found, using default location')
          setLocationError('Provinsi tidak ditemukan dalam database')
          setDefaultLocation()
          return
        }

        // Find city/county - check multiple fields in order
        // Nominatim can return different field names depending on location type
        // Priority: county (kabupaten) > city > town > municipality
        let rawCityName = null
        let cityType = null // 'Kab.' or 'Kota'

        console.log('🔍 Checking address fields for city...')

        // Use county as primary source for kabupaten
        if (address.county) {
          rawCityName = address.county
          cityType = 'Kab.'
          console.log(`✅ County found: "${rawCityName}" → Will use "${cityType} ${rawCityName}"`)
        } else if (address.city) {
          rawCityName = address.city
          cityType = 'Kota'
          console.log(`✅ City found: "${rawCityName}" → Will use "${cityType} ${rawCityName}"`)
        } else if (address.town) {
          rawCityName = address.town
          console.log(`✅ Town found: "${rawCityName}" → Will determine type from matching`)
        } else if (address.municipality) {
          rawCityName = address.municipality
          console.log(`✅ Municipality found: "${rawCityName}"`)
        }

        if (!rawCityName) {
          console.warn('⚠️ No city name found in address')
          setDefaultLocation()
          return
        }

        // Add prefix if we know the type, otherwise let matching handle it
        let cityNameForMatching = rawCityName
        if (cityType) {
          cityNameForMatching = `${cityType} ${rawCityName}`
          console.log(`📋 Final city name for matching: "${cityNameForMatching}"`)
        } else {
          console.log(`📋 Using raw city name for matching: "${cityNameForMatching}"`)
        }

        // Now set location - this will load cities and match to API format
        console.log(`🎯 Calling setLocation with: province="${foundProvince}", city="${cityNameForMatching}"`)
        await setLocation(foundProvince, cityNameForMatching)
      } else {
        console.error('❌ No address data in Nominatim response')
        setDefaultLocation()
      }
    } catch (error) {
      console.error('❌ Reverse geocoding error:', error)
      setDefaultLocation()
    }
  }

  const findMatchingProvince = (name) => {
    if (!name) {
      console.log('⚠️ No province name provided')
      return null
    }

    // Normalize input name
    const normalizedName = name.toLowerCase()
      .replace(/^(provinsi|prov|daerah|istimewa|khusus)\s*/i, '')
      .replace(/\s+(daerah|istimewa|khusus)\s*/i, ' ')
      .trim()

    console.log(`🔍 Finding province match for: "${name}" (normalized: "${normalizedName}")`)

    // Exact match
    let match = provinces.find(p => {
      const provinceName = p.toLowerCase()
        .replace(/^(provinsi|prov|d\.i\.|d\.i\.|daerah|istimewa)\s*/i, '')
        .trim()
      return provinceName === normalizedName
    })
    if (match) {
      console.log(`✅ Exact province match: "${match}"`)
      return match
    }

    // Partial match
    match = provinces.find(p => {
      const provinceName = p.toLowerCase()
        .replace(/^(provinsi|prov|d\.i\.|daerah|istimewa)\s*/i, '')
        .trim()
      return provinceName.includes(normalizedName) || normalizedName.includes(provinceName)
    })
    if (match) {
      console.log(`✅ Partial province match: "${match}"`)
    } else {
      console.log(`❌ No province match found for: "${name}"`)
    }
    return match
  }

  const findMatchingCity = (name, citiesList) => {
    if (!name) {
      console.log('⚠️ No city name provided')
      return null
    }
    if (!citiesList?.length) {
      console.log('⚠️ No cities list provided')
      return null
    }

    // Normalize input name - handle various formats from GPS
    const normalizedName = name.toLowerCase()
      .replace(/^(kabupaten|kabupaten|kab|kota|city|daerah|khusus|district|regency|municipality)\s*/i, '')
      .replace(/\s+(kabupaten|kab|kota|city|daerah|khusus)\s*/i, ' ')
      .trim()

    console.log(`🔍 Finding city match for: "${name}" (normalized: "${normalizedName}")`)
    console.log(`🏙️ Available cities (${citiesList.length}):`, citiesList)

    // Exact match (ignoring Kota/Kab prefix from API list)
    let match = citiesList.find(c => {
      // API format: "Kab. Bantul", "Kota Yogyakarta"
      const cityName = c.toLowerCase()
        .replace(/^kab\.?\s*/i, '')
        .replace(/^kota\s*/i, '')
        .trim()
      console.log(`   Comparing "${normalizedName}" with "${cityName}" (from "${c}"): ${cityName === normalizedName}`)
      return cityName === normalizedName
    })
    if (match) {
      console.log(`✅ Exact city match: "${match}"`)
      return match
    }

    // Partial match - for cases where GPS returns slightly different names
    console.log('⚠️ No exact match, trying partial match...')
    match = citiesList.find(c => {
      const cityName = c.toLowerCase()
        .replace(/^kab\.?\s*/i, '')
        .replace(/^kota\s*/i, '')
        .trim()
      const result = cityName.includes(normalizedName) || normalizedName.includes(cityName)
      console.log(`   Partial: "${cityName}" includes "${normalizedName}": ${result}`)
      return result
    })
    if (match) {
      console.log(`✅ Partial city match: "${match}"`)
    } else {
      console.log(`❌ No city match found for: "${name}"`)
      console.log(`🔍 Showing normalized comparison for debugging:`)
      citiesList.forEach(c => {
        const cityName = c.toLowerCase()
          .replace(/^kab\.?\s*/i, '')
          .replace(/^kota\s*/i, '')
          .trim()
        console.log(`   "${c}" → "${cityName}"`)
      })
    }
    return match
  }

  const setLocation = async (province, cityName) => {
    console.log(`🎯 Setting location: ${province} - ${cityName}`)
    setSelectedProvince(province)
    const citiesList = await fetchCities(province)
    console.log(`📋 Loaded ${citiesList.length} cities for ${province}`)

    // Find matching city from loaded cities
    const matched = findMatchingCity(cityName, citiesList)
    const finalCity = matched || citiesList[0]
    if (finalCity) {
      console.log(`🏙️ Final city selected: "${finalCity}"`)
      setSelectedCity(finalCity)
    }
    setLocating(false)
  }

  const setDefaultLocation = () => {
    console.log(`❌ Location detection failed, no default location set`)
    setLocating(false)
  }

  const retryLocation = () => detectLocation()

  // Event Handlers
  const navigateDate = (days) => {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() + days)
    setCurrentDate(newDate)
  }

  const goToToday = () => setCurrentDate(new Date())

  // Utility Functions
  const isToday = (date) => {
    const today = new Date()
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
  }

  const formatDateIndonesian = (date) => {
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ]
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
  }

  const parseTime = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return hours * 60 + minutes
  }

  // Computed Values
  const todaySchedule = useMemo(() => {
    if (!schedule?.length || !ramadanStartDate) return null

    const diffTime = currentDate - ramadanStartDate
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1

    return schedule.find(item => item.tanggal === diffDays)
  }, [schedule, currentDate, ramadanStartDate])

  const currentMinutes = useMemo(() => {
    return currentTime.getHours() * 60 + currentTime.getMinutes()
  }, [currentTime])

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
      { name: 'Isya', time: todaySchedule.isya }
    ]

    return prayers.find(prayer => parseTime(prayer.time) > currentMinutes) || null
  }, [todaySchedule, currentMinutes])

  const getRamadanDay = () => todaySchedule?.tanggal || null

  return (
    <div className="app">
      {/* Theme Toggle Button */}
      <button
        className="theme-toggle"
        onClick={toggleDarkMode}
        aria-label="Toggle dark mode"
      >
        {darkMode ? '☀️' : '🌙'}
      </button>

      {/* Adhan Master Toggle Button */}
      <button
        className={`adhan-master-toggle ${adhanEnabled ? 'enabled' : ''}`}
        onClick={toggleAdhanEnabled}
        aria-label="Toggle adhan"
        title={adhanEnabled ? 'Adzan dinyalakan' : 'Adzan dimatikan'}
      >
        {adhanEnabled ? '🔔' : '🔕'}
      </button>

      <header className="header">
        <h1>Jadwal Imsakiyah</h1>
        <p className="subtitle">Waktu Sholat & Imsakiyah</p>
        {scheduleMeta && (
          <p className="ramadan-info">Ramadan {scheduleMeta.hijriah} H</p>
        )}
        {selectedCity && selectedProvince && (
          <div className="location-wrapper">
            <button className="location-info-header" onClick={retryLocation} disabled={locating}>
              {locating ? '🔄' : '📍'} {selectedCity}, {selectedProvince}
            </button>
          </div>
        )}
        {/* Location Detection Button */}

      </header>

      <div className="container">
        {/* Locating Status */}
        {locating && (
          <div className="locating-status">
            <div className="locating-spinner"></div>
            <p>Mendeteksi lokasi Anda...</p>
          </div>
        )}

        {/* Location Error */}
        {locationError && !locating && (
          <div className="location-error">
            <p>{locationError}</p>
            <button className="retry-btn" onClick={retryLocation}>
              🔄 Coba Lagi
            </button>
          </div>
        )}



        {/* Date Navigation */}
        {schedule?.length > 0 && (
          <div className="date-nav">
            <button onClick={() => navigateDate(-1)}>&larr; Sebelumnya</button>
            <div className="date-display">
              {isToday(currentDate) && <span className="today-badge">Hari ini</span>}

              <span className="date-text">

                {formatDateIndonesian(currentDate)}
              </span>
              {getRamadanDay() && (
                <span className="ramadan-day">Hari ke-{getRamadanDay()}</span>
              )}

            </div>
            <button onClick={() => navigateDate(1)}>Selanjutnya &rarr;</button>
          </div>
        )}

        {/* Current Time Display */}
        {todaySchedule && (
          <div className="current-time">
            <p className="time-label">Waktu Sekarang</p>
            <p className="time-value">
              {currentTime.toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
            </p>
            {getNextPrayer && (
              <p className="next-prayer">
                Menuju {getNextPrayer.name}: <span>{getNextPrayer.time}</span>
              </p>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="loading">
            <p>Memuat jadwal...</p>
          </div>
        )}

        {/* Prayer Times */}
        {todaySchedule && !loading && (
          <div className="prayer-times">
            {[
              { name: 'Imsak', key: 'imsak' },
              { name: 'Subuh', key: 'subuh' },
              { name: 'Terbit', key: 'terbit' },
              { name: 'Dhuha', key: 'dhuha' },
              { name: 'Zuhur', key: 'dzuhur' },
              { name: 'Asar', key: 'ashar' },
              { name: 'Maghrib', key: 'maghrib' },
              { name: 'Isya', key: 'isya' }
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
          </div>
        )}

        {/* No Schedule Message */}
        {!loading && schedule?.length > 0 && !todaySchedule && (
          <div className="no-schedule">
            <p>Jadwal hanya tersedia untuk bulan Ramadan</p>
          </div>
        )}
      </div>

      <footer className="footer">
        <p>Copyright <a href="https://cahyonoz.my.id" target="_blank" rel="noopener noreferrer">cahyonoz.my.id</a></p>
      </footer>
    </div>
  )
}

function PrayerTimeRow({ name, time, isActive, currentMinutes, hasAdhan, isPlaying, onToggleAdhan }) {
  const [hours, minutes] = time.split(':').map(Number)
  const prayerMinutes = hours * 60 + minutes
  const isPassed = prayerMinutes < currentMinutes

  return (
    <div className={`prayer-row ${isActive ? 'active' : ''} ${isPassed ? 'passed' : ''} ${isPlaying ? 'playing' : ''}`}>
      <div className="prayer-info">
        <span className="prayer-name">{name}</span>
        {hasAdhan && (
          <button
            className="adhan-play-btn"
            onClick={onToggleAdhan}
            title={isPlaying ? 'Stop adzan' : 'Putar adzan'}
          >
            {isPlaying ? '⏹️' : '🔔'}
          </button>
        )}
      </div>
      <span className="prayer-time">{time}</span>
    </div>
  )
}

export default App
