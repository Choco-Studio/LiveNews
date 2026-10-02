// A small world gazetteer: countries, capitals and major cities, regions, seas
// and continents with approximate coordinates. The offline (mock) writer uses
// it to put stories on the map, and the bulletin validator uses it to check
// that a place given by an AI writer is really named in the story.
//
// Coordinates are rounded (a pin on a 384x216 world map is ~1 degree wide);
// countries use a point near their middle, cities their centre.

// [name, lat, lon, short label or null, aliases, demonyms, flags]
// flags: 'amb' = also an everyday word or a person's name (never auto-detected)
const COUNTRIES = [
  // Europe
  ['United Kingdom', 54.0, -2.0, 'UK', ['UK', 'U.K.', 'Britain', 'Great Britain'], ['British', 'Briton', 'Britons']],
  ['Ireland', 53.2, -8.0, null, ['Republic of Ireland'], ['Irish']],
  ['France', 46.6, 2.4, null, [], ['French']],
  ['Germany', 51.2, 10.4, null, [], ['German', 'Germans']],
  ['Spain', 40.2, -3.7, null, [], ['Spanish', 'Spaniards']],
  ['Portugal', 39.6, -8.0, null, [], ['Portuguese']],
  ['Italy', 42.8, 12.5, null, [], ['Italian', 'Italians']],
  ['Netherlands', 52.2, 5.5, null, ['Holland', 'the Netherlands'], ['Dutch']],
  ['Belgium', 50.6, 4.6, null, [], ['Belgian', 'Belgians']],
  ['Luxembourg', 49.8, 6.1, null, [], []],
  ['Switzerland', 46.8, 8.2, null, [], ['Swiss']],
  ['Austria', 47.6, 14.1, null, [], ['Austrian', 'Austrians']],
  ['Poland', 52.1, 19.4, null, [], ['Polish', 'Poles']],
  ['Czech Republic', 49.8, 15.5, null, ['Czechia'], ['Czech']],
  ['Slovakia', 48.7, 19.7, null, [], ['Slovak']],
  ['Hungary', 47.2, 19.5, null, [], ['Hungarian', 'Hungarians']],
  ['Romania', 45.9, 24.9, null, [], ['Romanian', 'Romanians']],
  ['Bulgaria', 42.7, 25.5, null, [], ['Bulgarian', 'Bulgarians']],
  ['Greece', 39.1, 22.0, null, [], ['Greek', 'Greeks']],
  ['Cyprus', 35.0, 33.2, null, [], ['Cypriot']],
  ['Malta', 35.9, 14.4, null, [], ['Maltese']],
  ['Turkey', 39.0, 35.2, null, ['Türkiye', 'Turkiye'], ['Turkish', 'Turks']],
  ['Ukraine', 49.0, 31.4, null, [], ['Ukrainian', 'Ukrainians']],
  ['Russia', 61.5, 90.0, null, ['Russian Federation'], ['Russian', 'Russians']],
  ['Belarus', 53.7, 28.0, null, [], ['Belarusian']],
  ['Lithuania', 55.2, 23.9, null, [], ['Lithuanian']],
  ['Latvia', 56.9, 24.6, null, [], ['Latvian']],
  ['Estonia', 58.6, 25.0, null, [], ['Estonian']],
  ['Finland', 64.0, 26.0, null, [], ['Finnish', 'Finns']],
  ['Sweden', 62.0, 15.0, null, [], ['Swedish', 'Swedes']],
  ['Norway', 61.0, 8.5, null, [], ['Norwegian', 'Norwegians']],
  ['Denmark', 56.0, 10.0, null, [], ['Danish', 'Danes']],
  ['Iceland', 64.9, -18.6, null, [], ['Icelandic', 'Icelanders']],
  ['Serbia', 44.0, 20.9, null, [], ['Serbian', 'Serbs']],
  ['Croatia', 45.1, 15.2, null, [], ['Croatian', 'Croats']],
  ['Bosnia and Herzegovina', 44.2, 17.8, 'BOSNIA', ['Bosnia'], ['Bosnian']],
  ['Slovenia', 46.1, 14.8, null, [], ['Slovenian']],
  ['Albania', 41.2, 20.2, null, [], ['Albanian']],
  ['North Macedonia', 41.6, 21.7, null, [], []],
  ['Montenegro', 42.7, 19.4, null, [], []],
  ['Kosovo', 42.6, 20.9, null, [], []],
  ['Moldova', 47.4, 28.4, null, [], ['Moldovan']],
  ['Georgia', 42.3, 43.4, null, [], ['Georgian'], 'amb'],
  ['Armenia', 40.1, 45.0, null, [], ['Armenian', 'Armenians']],
  ['Azerbaijan', 40.1, 47.6, null, [], ['Azerbaijani']],
  // Middle East
  ['Israel', 31.0, 34.9, null, [], ['Israeli', 'Israelis']],
  ['Lebanon', 33.9, 35.9, null, [], ['Lebanese']],
  ['Syria', 35.0, 38.5, null, [], ['Syrian', 'Syrians']],
  ['Jordan', 31.0, 36.5, null, [], ['Jordanian'], 'amb'],
  ['Iraq', 33.2, 43.7, null, [], ['Iraqi', 'Iraqis']],
  ['Iran', 32.4, 53.7, null, [], ['Iranian', 'Iranians']],
  ['Saudi Arabia', 23.9, 45.1, null, [], ['Saudi']],
  ['Yemen', 15.6, 48.5, null, [], ['Yemeni']],
  ['Oman', 21.5, 55.9, null, [], ['Omani']],
  ['United Arab Emirates', 23.4, 53.8, 'UAE', ['UAE', 'the Emirates'], ['Emirati']],
  ['Qatar', 25.3, 51.2, null, [], ['Qatari']],
  ['Kuwait', 29.3, 47.5, null, [], ['Kuwaiti']],
  ['Bahrain', 26.0, 50.6, null, [], []],
  ['Egypt', 26.8, 30.8, null, [], ['Egyptian', 'Egyptians']],
  // Africa
  ['Morocco', 31.8, -7.1, null, [], ['Moroccan']],
  ['Algeria', 28.0, 1.7, null, [], ['Algerian']],
  ['Tunisia', 34.0, 9.5, null, [], ['Tunisian']],
  ['Libya', 26.3, 17.2, null, [], ['Libyan']],
  ['Sudan', 12.9, 30.2, null, [], ['Sudanese']],
  ['South Sudan', 6.9, 31.3, null, [], []],
  ['Ethiopia', 9.1, 40.5, null, [], ['Ethiopian', 'Ethiopians']],
  ['Eritrea', 15.2, 39.8, null, [], ['Eritrean']],
  ['Somalia', 5.2, 46.2, null, [], ['Somali']],
  ['Kenya', 0.0, 37.9, null, [], ['Kenyan', 'Kenyans']],
  ['Uganda', 1.4, 32.3, null, [], ['Ugandan']],
  ['Tanzania', -6.4, 34.9, null, [], ['Tanzanian']],
  ['Rwanda', -1.9, 29.9, null, [], ['Rwandan']],
  ['Democratic Republic of the Congo', -4.0, 21.8, 'DR CONGO', ['DR Congo', 'DRC'], ['Congolese']],
  ['Nigeria', 9.1, 8.7, null, [], ['Nigerian', 'Nigerians']],
  ['Ghana', 7.9, -1.0, null, [], ['Ghanaian']],
  ['Senegal', 14.5, -14.5, null, [], ['Senegalese']],
  ['Mali', 17.6, -4.0, null, [], ['Malian']],
  ['Niger', 17.6, 8.1, null, [], ['Nigerien'], 'amb'],
  ['Burkina Faso', 12.2, -1.6, null, [], []],
  ['Ivory Coast', 7.5, -5.5, null, ["Côte d'Ivoire", "Cote d'Ivoire"], ['Ivorian']],
  ['Cameroon', 7.4, 12.4, null, [], ['Cameroonian']],
  ['Chad', 15.5, 18.7, null, [], ['Chadian'], 'amb'],
  ['Angola', -11.2, 17.9, null, [], ['Angolan']],
  ['Zambia', -13.1, 27.8, null, [], ['Zambian']],
  ['Zimbabwe', -19.0, 29.2, null, [], ['Zimbabwean']],
  ['Mozambique', -18.7, 35.5, null, [], []],
  ['Madagascar', -18.8, 46.9, null, [], ['Malagasy']],
  ['Malawi', -13.3, 34.3, null, [], ['Malawian']],
  ['South Africa', -30.6, 22.9, null, [], ['South African', 'South Africans']],
  ['Namibia', -22.6, 17.1, null, [], ['Namibian']],
  ['Botswana', -22.3, 24.7, null, [], []],
  // Asia
  ['India', 20.6, 78.9, null, [], ['Indian', 'Indians']],
  ['Pakistan', 30.4, 69.3, null, [], ['Pakistani', 'Pakistanis']],
  ['Bangladesh', 23.7, 90.4, null, [], ['Bangladeshi']],
  ['Sri Lanka', 7.9, 80.8, null, [], ['Sri Lankan']],
  ['Nepal', 28.4, 84.1, null, [], ['Nepali', 'Nepalese']],
  ['Afghanistan', 33.9, 67.7, null, [], ['Afghan', 'Afghans']],
  ['China', 35.9, 104.2, null, [], ['Chinese']],
  ['Japan', 36.2, 138.3, null, [], ['Japanese']],
  ['South Korea', 35.9, 127.8, null, [], ['South Korean', 'South Koreans']],
  ['North Korea', 40.3, 127.5, null, [], ['North Korean']],
  ['Taiwan', 23.7, 121.0, null, [], ['Taiwanese']],
  ['Mongolia', 46.9, 103.8, null, [], ['Mongolian']],
  ['Vietnam', 14.1, 108.3, null, ['Viet Nam'], ['Vietnamese']],
  ['Thailand', 15.9, 100.9, null, [], ['Thai']],
  ['Cambodia', 12.6, 104.9, null, [], ['Cambodian']],
  ['Laos', 19.9, 102.5, null, [], []],
  ['Myanmar', 21.9, 95.9, null, ['Burma'], []],
  ['Malaysia', 4.2, 102.0, null, [], ['Malaysian']],
  ['Singapore', 1.35, 103.8, null, [], ['Singaporean']],
  ['Indonesia', -0.8, 113.9, null, [], ['Indonesian', 'Indonesians']],
  ['Philippines', 12.9, 121.8, null, ['the Philippines'], ['Filipino', 'Filipinos']],
  ['Kazakhstan', 48.0, 66.9, null, [], []],
  ['Uzbekistan', 41.4, 64.6, null, [], []],
  // Americas
  ['United States', 39.8, -98.6, 'USA', ['US', 'U.S.', 'USA', 'United States of America'], ['Americans']],
  ['Canada', 56.1, -106.3, null, [], ['Canadian', 'Canadians']],
  ['Mexico', 23.6, -102.6, null, [], ['Mexican', 'Mexicans']],
  ['Guatemala', 15.8, -90.2, null, [], []],
  ['Honduras', 15.2, -86.2, null, [], []],
  ['El Salvador', 13.8, -88.9, null, [], []],
  ['Nicaragua', 12.9, -85.2, null, [], []],
  ['Costa Rica', 9.7, -83.8, null, [], []],
  ['Panama', 8.5, -80.8, null, [], ['Panamanian']],
  ['Cuba', 21.5, -77.8, null, [], ['Cuban', 'Cubans']],
  ['Haiti', 19.0, -72.3, null, [], ['Haitian']],
  ['Dominican Republic', 18.7, -70.2, null, [], []],
  ['Jamaica', 18.1, -77.3, null, [], ['Jamaican']],
  ['Colombia', 4.6, -74.3, null, [], ['Colombian']],
  ['Venezuela', 6.4, -66.6, null, [], ['Venezuelan']],
  ['Ecuador', -1.8, -78.2, null, [], []],
  ['Peru', -9.2, -75.0, null, [], ['Peruvian']],
  ['Bolivia', -16.3, -63.6, null, [], ['Bolivian']],
  ['Brazil', -14.2, -51.9, null, [], ['Brazilian', 'Brazilians']],
  ['Paraguay', -23.4, -58.4, null, [], []],
  ['Uruguay', -32.5, -55.8, null, [], []],
  ['Argentina', -38.4, -63.6, null, [], ['Argentine', 'Argentinian']],
  ['Chile', -35.7, -71.5, null, [], ['Chilean']],
  // Oceania
  ['Australia', -25.3, 133.8, null, [], ['Australian', 'Australians']],
  ['New Zealand', -40.9, 174.9, null, [], ['New Zealander']],
  ['Papua New Guinea', -6.3, 143.9, null, [], []],
  ['Fiji', -17.7, 178.1, null, [], ['Fijian']],
];

// [name, lat, lon, country, aliases]
const CITIES = [
  ['London', 51.51, -0.13, 'United Kingdom'],
  ['Manchester', 53.48, -2.24, 'United Kingdom'],
  ['Edinburgh', 55.95, -3.19, 'United Kingdom'],
  ['Dublin', 53.35, -6.26, 'Ireland'],
  ['Paris', 48.86, 2.35, 'France'],
  ['Marseille', 43.3, 5.37, 'France'],
  ['Berlin', 52.52, 13.4, 'Germany'],
  ['Munich', 48.14, 11.58, 'Germany'],
  ['Hamburg', 53.55, 9.99, 'Germany'],
  ['Madrid', 40.42, -3.7, 'Spain'],
  ['Barcelona', 41.39, 2.17, 'Spain'],
  ['Valencia', 39.47, -0.38, 'Spain'],
  ['Seville', 37.39, -5.98, 'Spain'],
  ['Bilbao', 43.26, -2.93, 'Spain'],
  ['Lisbon', 38.72, -9.14, 'Portugal'],
  ['Porto', 41.15, -8.61, 'Portugal'],
  ['Rome', 41.9, 12.5, 'Italy'],
  ['Milan', 45.46, 9.19, 'Italy'],
  ['Turin', 45.07, 7.69, 'Italy', ['Torino']],
  ['Venice', 45.44, 12.32, 'Italy'],
  ['Naples', 40.85, 14.27, 'Italy'],
  ['Amsterdam', 52.37, 4.9, 'Netherlands'],
  ['Rotterdam', 51.92, 4.48, 'Netherlands'],
  ['Brussels', 50.85, 4.35, 'Belgium'],
  ['Geneva', 46.2, 6.14, 'Switzerland'],
  ['Zurich', 47.38, 8.54, 'Switzerland'],
  ['Vienna', 48.21, 16.37, 'Austria'],
  ['Prague', 50.08, 14.44, 'Czech Republic'],
  ['Warsaw', 52.23, 21.01, 'Poland'],
  ['Budapest', 47.5, 19.04, 'Hungary'],
  ['Bucharest', 44.43, 26.1, 'Romania'],
  ['Athens', 37.98, 23.73, 'Greece'],
  ['Stockholm', 59.33, 18.07, 'Sweden'],
  ['Oslo', 59.91, 10.75, 'Norway'],
  ['Copenhagen', 55.68, 12.57, 'Denmark'],
  ['Helsinki', 60.17, 24.94, 'Finland'],
  ['Reykjavik', 64.15, -21.94, 'Iceland', ['Reykjavík']],
  ['Kyiv', 50.45, 30.52, 'Ukraine', ['Kiev']],
  ['Moscow', 55.76, 37.62, 'Russia'],
  ['Istanbul', 41.01, 28.98, 'Turkey'],
  ['Ankara', 39.93, 32.86, 'Turkey'],
  ['Jerusalem', 31.77, 35.21, 'Israel'],
  ['Tel Aviv', 32.09, 34.78, 'Israel'],
  ['Beirut', 33.89, 35.5, 'Lebanon'],
  ['Damascus', 33.51, 36.28, 'Syria'],
  ['Baghdad', 33.31, 44.37, 'Iraq'],
  ['Tehran', 35.69, 51.39, 'Iran'],
  ['Riyadh', 24.71, 46.68, 'Saudi Arabia'],
  ['Dubai', 25.2, 55.27, 'United Arab Emirates'],
  ['Abu Dhabi', 24.45, 54.38, 'United Arab Emirates'],
  ['Doha', 25.29, 51.53, 'Qatar'],
  ['Cairo', 30.04, 31.24, 'Egypt'],
  ['Casablanca', 33.57, -7.59, 'Morocco'],
  ['Khartoum', 15.5, 32.56, 'Sudan'],
  ['Addis Ababa', 9.03, 38.74, 'Ethiopia'],
  ['Nairobi', -1.29, 36.82, 'Kenya'],
  ['Mombasa', -4.04, 39.67, 'Kenya'],
  ['Kampala', 0.35, 32.58, 'Uganda'],
  ['Dar es Salaam', -6.79, 39.21, 'Tanzania'],
  ['Kigali', -1.95, 30.06, 'Rwanda'],
  ['Kinshasa', -4.44, 15.27, 'Democratic Republic of the Congo'],
  ['Lagos', 6.52, 3.38, 'Nigeria'],
  ['Abuja', 9.08, 7.4, 'Nigeria'],
  ['Accra', 5.6, -0.19, 'Ghana'],
  ['Dakar', 14.72, -17.47, 'Senegal'],
  ['Johannesburg', -26.2, 28.05, 'South Africa'],
  ['Cape Town', -33.92, 18.42, 'South Africa'],
  ['Delhi', 28.61, 77.21, 'India', ['New Delhi']],
  ['Mumbai', 19.08, 72.88, 'India'],
  ['Bengaluru', 12.97, 77.59, 'India', ['Bangalore']],
  ['Kolkata', 22.57, 88.36, 'India'],
  ['Chennai', 13.08, 80.27, 'India'],
  ['Karachi', 24.86, 67.01, 'Pakistan'],
  ['Islamabad', 33.68, 73.05, 'Pakistan'],
  ['Dhaka', 23.81, 90.41, 'Bangladesh'],
  ['Kathmandu', 27.72, 85.32, 'Nepal'],
  ['Kabul', 34.56, 69.21, 'Afghanistan'],
  ['Beijing', 39.9, 116.41, 'China'],
  ['Shanghai', 31.23, 121.47, 'China'],
  ['Hong Kong', 22.32, 114.17, 'China'],
  ['Shenzhen', 22.54, 114.06, 'China'],
  ['Tokyo', 35.68, 139.69, 'Japan'],
  ['Osaka', 34.69, 135.5, 'Japan'],
  ['Kyoto', 35.01, 135.77, 'Japan'],
  ['Seoul', 37.57, 126.98, 'South Korea'],
  ['Pyongyang', 39.04, 125.76, 'North Korea'],
  ['Taipei', 25.03, 121.57, 'Taiwan'],
  ['Bangkok', 13.76, 100.5, 'Thailand'],
  ['Hanoi', 21.03, 105.85, 'Vietnam'],
  ['Ho Chi Minh City', 10.82, 106.63, 'Vietnam'],
  ['Kuala Lumpur', 3.14, 101.69, 'Malaysia'],
  ['Jakarta', -6.21, 106.85, 'Indonesia'],
  ['Manila', 14.6, 120.98, 'Philippines'],
  ['Sydney', -33.87, 151.21, 'Australia'],
  ['Melbourne', -37.81, 144.96, 'Australia'],
  ['Perth', -31.95, 115.86, 'Australia'],
  ['Auckland', -36.85, 174.76, 'New Zealand'],
  ['Wellington', -41.29, 174.78, 'New Zealand'],
  ['New York', 40.71, -74.01, 'United States', ['New York City']],
  ['Washington', 38.91, -77.04, 'United States', ['Washington DC', 'Washington, DC']],
  ['Los Angeles', 34.05, -118.24, 'United States'],
  ['San Francisco', 37.77, -122.42, 'United States'],
  ['Chicago', 41.88, -87.63, 'United States'],
  ['Houston', 29.76, -95.37, 'United States'],
  ['Miami', 25.76, -80.19, 'United States'],
  ['Seattle', 47.61, -122.33, 'United States'],
  ['Boston', 42.36, -71.06, 'United States'],
  ['Toronto', 43.65, -79.38, 'Canada'],
  ['Montreal', 45.5, -73.57, 'Canada', ['Montréal']],
  ['Vancouver', 49.28, -123.12, 'Canada'],
  ['Ottawa', 45.42, -75.7, 'Canada'],
  ['Mexico City', 19.43, -99.13, 'Mexico'],
  ['Cancún', 21.16, -86.85, 'Mexico', ['Cancun']],
  ['Mérida', 20.97, -89.62, 'Mexico', ['Merida']],
  ['Panama City', 8.98, -79.52, 'Panama'],
  ['Havana', 23.11, -82.37, 'Cuba'],
  ['Bogotá', 4.71, -74.07, 'Colombia', ['Bogota']],
  ['Caracas', 10.48, -66.9, 'Venezuela'],
  ['Lima', -12.05, -77.04, 'Peru'],
  ['Quito', -0.18, -78.47, 'Ecuador'],
  ['Santiago', -33.45, -70.67, 'Chile'],
  ['Antofagasta', -23.65, -70.4, 'Chile'],
  ['Buenos Aires', -34.6, -58.38, 'Argentina'],
  ['São Paulo', -23.55, -46.63, 'Brazil', ['Sao Paulo']],
  ['Rio de Janeiro', -22.91, -43.17, 'Brazil'],
  ['Brasília', -15.79, -47.88, 'Brazil', ['Brasilia']],
];

// [name, lat, lon, country or null, aliases, flags]
// flags: 'broad' = a continent, ocean or sea (only used when nothing more precise is named)
const REGIONS = [
  ['Europe', 50.0, 10.0, null, [], 'broad'],
  ['Africa', 2.0, 20.0, null, [], 'broad'],
  ['Asia', 35.0, 90.0, null, [], 'broad'],
  ['Middle East', 29.0, 42.0, null, ['the Middle East'], 'broad'],
  ['Latin America', -10.0, -60.0, null, [], 'broad'],
  ['South America', -15.0, -60.0, null, [], 'broad'],
  ['North America', 45.0, -100.0, null, [], 'broad'],
  ['Central America', 13.0, -86.0, null, [], 'broad'],
  ['East Africa', 0.0, 37.0, null, [], 'broad'],
  ['West Africa', 10.0, -5.0, null, [], 'broad'],
  ['Southeast Asia', 10.0, 110.0, null, ['South-East Asia'], 'broad'],
  ['Scandinavia', 63.0, 14.0, null, [], 'broad'],
  ['Balkans', 43.0, 21.0, null, ['the Balkans'], 'broad'],
  ['Arctic', 78.0, 20.0, null, ['the Arctic'], 'broad'],
  ['Antarctica', -78.0, 20.0, null, ['the Antarctic'], 'broad'],
  ['Mediterranean', 35.5, 18.0, null, ['the Mediterranean'], 'broad'],
  ['Caribbean', 15.0, -73.0, null, ['the Caribbean'], 'broad'],
  ['Pacific', 0.0, -160.0, null, ['Pacific Ocean', 'the Pacific'], 'broad'],
  ['Atlantic', 25.0, -40.0, null, ['Atlantic Ocean', 'the Atlantic'], 'broad'],
  ['Indian Ocean', -20.0, 80.0, null, [], 'broad'],
  ['North Sea', 56.0, 3.0, null, [], 'broad'],
  ['Amazon', -3.5, -62.0, 'Brazil', ['Amazon rainforest', 'Amazon basin', 'Amazon River', 'the Amazon'], 'amb'],
  ['Sahara', 23.4, 13.0, null, ['Sahara desert', 'the Sahara']],
  ['Sahel', 14.5, 0.0, null, ['the Sahel']],
  ['Andes', -13.0, -72.0, null, ['the Andes']],
  ['Alps', 46.5, 10.0, null, ['the Alps']],
  ['Himalayas', 28.0, 84.0, null, ['the Himalayas', 'Himalaya']],
  ['Mount Everest', 27.99, 86.93, 'Nepal', ['Everest']],
  ['Siberia', 60.0, 105.0, 'Russia', []],
  ['Patagonia', -45.0, -69.0, 'Argentina', []],
  ['Greenland', 72.0, -40.0, 'Denmark', [], 'own'],
  ['Gaza', 31.4, 34.4, null, ['Gaza Strip'], 'own'],
  ['West Bank', 31.9, 35.3, null, ['the West Bank'], 'own'],
  ['Crimea', 45.0, 34.1, 'Ukraine', []],
  ['Donbas', 48.0, 38.0, 'Ukraine', ['Donbass']],
  ['Kashmir', 34.1, 74.8, null, [], 'own'],
  ['Tibet', 31.0, 88.0, 'China', []],
  ['Xinjiang', 41.0, 85.0, 'China', []],
  ['Tigray', 14.0, 39.0, 'Ethiopia', []],
  ['Darfur', 13.5, 24.0, 'Sudan', []],
  ['Sinai', 29.5, 33.8, 'Egypt', ['Sinai peninsula']],
  ['Kurdistan', 36.5, 44.0, null, [], 'own'],
  ['Kerala', 10.5, 76.3, 'India', []],
  ['Catalonia', 41.8, 1.5, 'Spain', []],
  ['Andalusia', 37.4, -4.6, 'Spain', []],
  ['Canary Islands', 28.3, -15.6, 'Spain', ['the Canaries']],
  ['Scotland', 56.5, -4.2, 'United Kingdom', [], 'own'],
  ['Wales', 52.3, -3.7, 'United Kingdom', [], 'own'],
  ['England', 52.5, -1.5, 'United Kingdom', [], 'own'],
  ['Northern Ireland', 54.6, -6.7, 'United Kingdom', [], 'own'],
  ['Bavaria', 48.8, 11.5, 'Germany', []],
  ['Sicily', 37.6, 14.0, 'Italy', []],
  ['Sardinia', 40.1, 9.0, 'Italy', []],
  ['Tuscany', 43.4, 11.0, 'Italy', []],
  ['Corsica', 42.0, 9.0, 'France', []],
  ['Brittany', 48.2, -3.0, 'France', []],
  ['Crete', 35.2, 24.9, 'Greece', []],
  ['Greek islands', 37.5, 25.0, 'Greece', []],
  ['California', 37.0, -119.5, 'United States', []],
  ['Texas', 31.0, -99.0, 'United States', []],
  ['Florida', 28.0, -81.7, 'United States', []],
  ['Alaska', 64.0, -150.0, 'United States', []],
  ['Hawaii', 20.8, -156.3, 'United States', []],
  ['Quebec', 52.0, -72.0, 'Canada', ['Québec']],
  ['British Columbia', 54.0, -125.0, 'Canada', []],
  ['Queensland', -22.0, 145.0, 'Australia', []],
  ['Tasmania', -42.0, 146.6, 'Australia', []],
  ['Great Barrier Reef', -18.3, 147.7, 'Australia', []],
  ['Bali', -8.4, 115.2, 'Indonesia', []],
  ['Borneo', 0.9, 114.0, null, []],
  ['Sumatra', -0.6, 101.3, 'Indonesia', []],
  ['Hokkaido', 43.2, 142.9, 'Japan', []],
  ['Okinawa', 26.3, 127.8, 'Japan', []],
  ['Galápagos', -0.8, -91.0, 'Ecuador', ['Galapagos', 'Galápagos Islands', 'Galapagos Islands']],
  ['Reykjanes peninsula', 63.9, -22.3, 'Iceland', ['Reykjanes']],
  ['Yellowstone', 44.6, -110.5, 'United States', []],
  ['Yucatán peninsula', 20.0, -88.8, 'Mexico', ['Yucatán', 'Yucatan', 'Yucatan peninsula']],
  ['Gulf of Mexico', 25.0, -90.0, null, ['the Gulf of Mexico'], 'broad'],
  // A compass part of a country ("northern Chile") is pinned where it is, not at the country's middle.
  ['northern Chile', -22.5, -69.5, 'Chile', ['Northern Chile', 'north of Chile'], 'own'],
  ['southern Chile', -42.0, -72.5, 'Chile', ['Southern Chile', 'south of Chile'], 'own'],
  ['northern Spain', 43.0, -4.5, 'Spain', ['Northern Spain', 'north of Spain'], 'own'],
  ['southern Spain', 37.4, -4.6, 'Spain', ['Southern Spain', 'south of Spain'], 'own'],
  ['northern Italy', 45.4, 9.5, 'Italy', ['Northern Italy', 'north of Italy'], 'own'],
  ['western Norway', 61.0, 6.0, 'Norway', ['Western Norway', 'west coast of Norway', "Norway's west coast"], 'own'],
  ['northern India', 28.5, 77.5, 'India', ['Northern India', 'north of India'], 'own'],
  ['southern India', 11.0, 77.5, 'India', ['Southern India', 'south of India'], 'own'],
  ['northern Brazil', -3.0, -60.0, 'Brazil', ['Northern Brazil', 'north of Brazil'], 'own'],
  ['northern Andes', -6.0, -77.5, 'Peru', ['Northern Andes'], 'own'],
];

const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`]/g, "'")
    .toLowerCase();

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function build() {
  const entries = [];
  const byName = new Map(); // folded name/alias/label -> entry
  const add = (e) => {
    entries.push(e);
    for (const n of [e.name, ...e.aliases, e.label]) if (n && !byName.has(fold(n))) byName.set(fold(n), e);
  };
  for (const [name, lat, lon, label, aliases = [], demonyms = [], flag] of COUNTRIES) {
    add({ kind: 'country', name, lat, lon, label: (label || name).toUpperCase(), aliases, demonyms, country: name, amb: flag === 'amb', broad: false });
  }
  const countryLabel = (name) => byName.get(fold(name))?.label || name.toUpperCase();
  for (const [name, lat, lon, country, aliases = []] of CITIES) {
    add({ kind: 'city', name, lat, lon, label: `${name.toUpperCase()}, ${countryLabel(country)}`, aliases, demonyms: [], country, amb: false, broad: false });
  }
  for (const [name, lat, lon, country, aliases = [], flag] of REGIONS) {
    // Regions with a political identity of their own ("own") are not labelled with a country.
    const label = country && flag !== 'own' ? `${name.toUpperCase()}, ${countryLabel(country)}` : name.toUpperCase();
    add({ kind: 'region', name, lat, lon, label, aliases, demonyms: [], country, amb: flag === 'amb', broad: flag === 'broad' });
  }
  // Ambiguous names are matched only through their unambiguous aliases (e.g. "the Amazon").
  for (const e of entries) {
    const names = [e.name, ...e.aliases].filter((n) => !(e.amb && n === e.name));
    names.sort((a, b) => b.length - a.length);
    e.re = names.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'gu') : null;
    e.demonymRe = e.demonyms.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${e.demonyms.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'u') : null;
  }
  return { entries, byName };
}

const { entries: ENTRIES, byName: BY_NAME } = build();

// Place names that are also common first names: "Israel Adesanya", "Sydney Sweeney",
// "Santiago Abascal", "Paris Hilton". Followed by a capitalised word that is not a
// place, they are taken as a person, not a pin on the map.
const PERSON_NAMES = new Set(['israel', 'sydney', 'santiago', 'paris', 'victoria', 'jordan', 'georgia', 'chad', 'lincoln', 'austin', 'florence', 'madison', 'charlotte', 'phoenix', 'houston', 'dallas', 'orlando', 'adelaide', 'regina', 'washington', 'darwin', 'hamilton', 'kent', 'lima', 'wellington', 'chelsea', 'jackson', 'aurora', 'dakota', 'denver', 'sofia', 'valencia', 'savannah', 'eugene', 'tyler']);
// Capitalised words that keep a place a place: "Sydney Harbour", "Paris Monday", "Lima Airport".
const PLACE_FOLLOWERS = /^(?:City|Airport|Harbour|Harbor|Police|Metro|Zoo|Museum|University|Council|Mayor|Bay|River|Region|Province|Summit|Agreement|Accord|Opera|Marathon|Club|Stock|Exchange|Fashion|Motor|Games|Olympics|Declaration|Conference|Talks|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)$/;
// "New Mexico", "South Wales", "West Virginia": a compass word or "New" in front of a
// name makes a different place (the real compound, when we know it, is matched first).
const PREFIXED = /(?:^|[^\p{L}])(?:New|North|South|East|West)\s$/u;
// A few everyday clashes: the bird, not the country; the US state, not the capital.
const CONTEXT_CLASH = {
  turkey: (text) => /\b(?:Thanksgiving|Christmas|poultry|roast|bird flu|farmers?)\b/.test(text),
  washington: (text, end) => /^\s+(?:state|State)\b/.test(text.slice(end, end + 8)),
};

/** Is the match of `entry` at [index, end) in `text` really that place? */
function realHit(entry, text, index, end, matched) {
  const key = fold(matched);
  if (PREFIXED.test(text.slice(Math.max(0, index - 7), index)) && !/^(?:new|north|south|east|west) /.test(key)) return false;
  if (PERSON_NAMES.has(key)) {
    const next = text.slice(end).match(/^ ([A-Z][\p{L}'’-]+)/u);
    if (next && !PLACE_FOLLOWERS.test(next[1]) && !BY_NAME.has(fold(next[1]))) return false;
  }
  const clash = CONTEXT_CLASH[fold(entry.name)];
  return !(clash && clash(text, end));
}

export const GAZETTEER = ENTRIES;

/** Look a place up by its name, an alias or its label ("NAIROBI, KENYA" → Nairobi). */
export function lookupPlace(name) {
  const key = fold(name).trim();
  if (BY_NAME.has(key)) return BY_NAME.get(key);
  const first = key.split(',')[0].trim();
  return BY_NAME.get(first) || null;
}

/**
 * Every place named in `text`, in order of appearance, without overlaps (the
 * longest name wins: "New York" not "York", "South Africa" not "Africa").
 * Names are matched case-sensitively, as written in news copy.
 * Returns [{ entry, index, text }].
 */
export function findPlaces(text) {
  const s = String(text ?? '');
  const hits = [];
  for (const e of ENTRIES) {
    if (!e.re) continue;
    e.re.lastIndex = 0;
    for (const m of s.matchAll(e.re)) hits.push({ entry: e, index: m.index, end: m.index + m[0].length, text: m[0] });
  }
  // Longest names first win overlaps below; filtered hits must not block shorter real ones.
  for (let i = hits.length - 1; i >= 0; i--) if (!realHit(hits[i].entry, s, hits[i].index, hits[i].end, hits[i].text)) hits.splice(i, 1);
  hits.sort((a, b) => a.index - b.index || b.end - b.index - (a.end - a.index));
  const out = [];
  let reach = -1;
  for (const h of hits) {
    if (h.index < reach) continue;
    out.push(h);
    reach = h.end;
  }
  return out.map(({ entry, index, text: t }) => ({ entry, index, text: t }));
}

/**
 * The best place for a story: the most precise place of the headline (a city
 * or region of the country it names wins over the country), else of the
 * summary. Continents and oceans only when nothing else is named.
 * Returns { place, lat, lon, entry } or null.
 */
export function locate(headline, summary = '') {
  const pick = (hits, all) => {
    const precise = hits.filter((h) => !h.entry.broad);
    if (!precise.length) return hits[0]?.entry || null;
    const first = precise[0].entry;
    if (first.kind === 'country') {
      // "Kenya switches on its largest solar farm near Nairobi" → Nairobi, Kenya
      const inside = all.find((h) => h.entry.kind !== 'country' && !h.entry.broad && h.entry.country === first.name);
      if (inside) return inside.entry;
    }
    return first;
  };
  const head = findPlaces(headline);
  const body = findPlaces(summary);
  const entry = pick(head, [...head, ...body]) || pick(body, body);
  return entry ? { place: entry.label, lat: entry.lat, lon: entry.lon, entry } : null;
}

/**
 * Distinct places named in a text, most precise first, without a place and
 * its own country both being listed (Athens and Greece → Athens). Broad
 * regions only when nothing else is named.
 */
export function placesIn(text, max = 4) {
  const hits = findPlaces(text);
  const precise = hits.filter((h) => !h.entry.broad);
  const list = [];
  for (const { entry } of precise.length ? precise : hits) {
    if (list.includes(entry)) continue;
    list.push(entry);
  }
  const kept = list.filter((e) => !(e.kind === 'country' && list.some((o) => o !== e && o.country === e.name)));
  return kept.slice(0, max).map((e) => ({ place: e.label, lat: e.lat, lon: e.lon, entry: e }));
}

/**
 * Is a place name (e.g. "LISBON, PORTUGAL") supported by the story text? Any
 * part of it named in the text is enough, as is a demonym ("French" for
 * France) or a place inside a named country ("Lisbon" supports PORTUGAL).
 */
export function placeSupported(place, text) {
  const raw = String(text ?? '');
  const body = fold(raw);
  if (!body.trim()) return false;
  const wordIn = (n) => {
    const f = fold(n).trim();
    return f.length >= 2 && new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(f)}(?![\\p{L}\\p{N}])`, 'u').test(body);
  };
  // A known place counts only where the text really names it (not "Sydney Sweeney", not "New Mexico").
  const namedAsPlace = (e) => {
    for (const n of [e.name, ...e.aliases]) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(n)}(?![\\p{L}\\p{N}])`, 'gu');
      for (const m of raw.matchAll(re)) if (realHit(e, raw, m.index, m.index + m[0].length, m[0])) return true;
    }
    return false;
  };
  const named = findPlaces(raw).map((h) => h.entry);
  for (const part of String(place ?? '').split(/[,/]/).map((p) => p.trim()).filter(Boolean)) {
    const e = lookupPlace(part);
    if (!e) {
      if (wordIn(part)) return true;
      continue;
    }
    if (namedAsPlace(e)) return true;
    if (e.demonymRe && e.demonymRe.test(raw)) return true;
    if (named.some((n) => n === e || (e.kind === 'country' && n.country === e.name))) return true;
  }
  return false;
}

// How far a writer's pin may sit from our point before it is put back: a city is
// small, a region bigger, and the widest countries span tens of degrees.
const HUGE = new Set(['Russia', 'Canada', 'United States', 'China', 'Brazil', 'Australia', 'Antarctica']);
const WIDE = new Set(['India', 'Argentina', 'Kazakhstan', 'Algeria', 'Democratic Republic of the Congo', 'Saudi Arabia', 'Mexico', 'Indonesia', 'Chile', 'Norway', 'Sudan', 'Libya', 'Iran', 'Mongolia', 'Peru']);
const snapRadius = (e) => (e.kind === 'city' ? 3 : e.kind === 'region' ? (e.broad ? 30 : 8) : HUGE.has(e.name) ? 40 : WIDE.has(e.name) ? 25 : 12);

/**
 * Put a writer's pin where the place really is: a known place (any kind) whose
 * coordinates are clearly off, swapped, or at (0, 0) gets the gazetteer point.
 * An unknown place at exactly (0, 0) is no pin at all; an unknown city in a known
 * country ("SPRINGFIELD, USA") must at least be in that country, or it is
 * pinned (and labelled) at the country. Returns the location or null.
 */
export function snapLocation(loc) {
  if (!loc) return null;
  const known = lookupPlace(loc.place);
  const nowhere = loc.lat === 0 && loc.lon === 0;
  if (!known) {
    // "PANAMA CITY, PANAMA" when we do not know the city: the pin must at least be in the country (or region)
    // the label names; a pin outside it is put on that country and the label says only what we know.
    const parts = String(loc.place).split(',').map((p) => p.trim()).filter(Boolean);
    const wider = parts.length > 1 ? lookupPlace(parts.at(-1)) : null;
    if (!wider) return nowhere ? null : loc;
    if (nowhere || degreesApart(loc, wider) > snapRadius(wider)) return { place: wider.label, lat: wider.lat, lon: wider.lon };
    return loc;
  }
  if (nowhere || degreesApart(loc, known) > snapRadius(known)) return { ...loc, lat: known.lat, lon: known.lon };
  return loc;
}

/** Great-circle-ish distance in degrees, good enough to spot a wrong pin. */
export function degreesApart(a, b) {
  const dLat = a.lat - b.lat;
  const dLon = ((a.lon - b.lon + 540) % 360) - 180;
  return Math.hypot(dLat, dLon * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180)));
}
