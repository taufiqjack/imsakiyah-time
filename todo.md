1. please create prayer time reminder like https://praytime.info/ using API https://equran.id/api/v2/imsakiyah 
2. not showing schedule after selected provinsi and kabupaten/kota
3. impelent search location by GPS and default is Jakarta
4. remove text hari ini in sebelumnya and selanjutnya
5. fix get location from GPS
6. add text Hari ini for today and change hari ini button to center of date text
7. to get location using body :
{
    "provinsi" : "D.I. Yogyakarta",
    "kabkota" : "Kab. Bantul"
} or

{
    "provinsi" : "Jawa Tengah",
    "kabkota" : "Kota Semarang"
}

8. the response location is : 
🏙️ Address fields: 
Object { road: "Jalan Raya Bandungrejo", hamlet: "Mranggen", village: "Kembangarum", county: "Demak", state: "Jawa Tengah", "ISO3166-2-lvl4": "ID-JT", region: "Jawa", "ISO3166-2-lvl3": "ID-JW", postcode: "59567", country: "Indonesia", … }
​
"ISO3166-2-lvl3": "ID-JW"
​
"ISO3166-2-lvl4": "ID-JT"
​
country: "Indonesia"
​
country_code: "id"
​
county: "Demak"
​
hamlet: "Mranggen"
​
postcode: "59567"
​
region: "Jawa"
​
road: "Jalan Raya Bandungrejo"
​
state: "Jawa Tengah"
​
village: "Kembangarum"
​
<prototype>: Object { … }
App.jsx:155:17


please auto selecting Kabupaten/Kota to county and add Kab. or Kota

9. remove form field Provinsi and Kabupaten/Kota, get from location GPS
10. in default show📍 Jakarta, Jawa Tengah
please fix manual to Kota Jakarta, DKI Jakarta
11. auto reload data when location is allowed, and default location is Kota Jakarta, DKI Jakarta
12. when open and reload web, auto detect location not jakarta but in not allowed location default is Kota Jakarta
13. remove jakarta to default time, change detech from location
14. the log is :
 County found: "Demak" → Will use "Kab. Demak" App.jsx:230:19
📋 Final city name for matching: "Kab. Demak" App.jsx:253:19
🎯 Calling setLocation with: province="Jawa Tengah", city="Kab. Demak" App.jsx:259:17
🎯 Setting location: Jawa Tengah - Kab. Demak App.jsx:374:13
📍 Geolocation permission state: prompt App.jsx:43:19
📋 Loaded 0 cities for Jawa Tengah App.jsx:377:13
⚠️ No cities list provided App.jsx:318:15
📍 Geolocation permission state: prompt

please get location this
15. change UI to modern design and support to darkmode
16. implement adzan for all time sholat from link https://rencanggunung.com/mp3/adzan.mp3 use toggle to play and only shubuh, implement adzan for Subuh time from link https://rencanggunung.com/mp3/adzan_shubuh.mp3
17. change toggle to play/stop adzan
18. add toggle to enable or disable adzan when sholat time
