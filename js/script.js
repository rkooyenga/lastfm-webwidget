class LastFmTidalWidget {
    constructor(elementId, options) {
        this.widgetElement = document.getElementById(elementId);
        if (!this.widgetElement) {
            console.error(`Widget element with ID "${elementId}" not found.`);
            return;
        }

        this.options = {
            apiKey: null,
            username: null,
            initialType: 'recent',
            period: '3month', // Default period for top items
            tidalKey: null, // For future Tidal integration
            placeholderImage: 'placeholder.png', // Default placeholder
            ...options // Override defaults with provided options
        };

        if (!this.options.apiKey || !this.options.username) {
            console.error("Last.fm API Key and Username are required.");
            this.showError("Configuration missing.");
            return;
        }

        // DOM Element References
        this.imageElement = this.widgetElement.querySelector('.widget__artwork');
        this.titleElement = this.widgetElement.querySelector('.widget__title');
        this.subtitleElement = this.widgetElement.querySelector('.widget__subtitle');
        this.playcountElement = this.widgetElement.querySelector('.widget__playcount');
        this.tabButtons = this.widgetElement.querySelectorAll('.widget__tab-button');
        this.grayscaleButton = this.widgetElement.querySelector('.widget__grayscale-toggle');
        this.loadingOverlay = this.widgetElement.querySelector('.widget__loading-overlay');

        this.currentType = this.options.initialType;
        this.isGrayscale = false;

        this.initEventListeners();
        this.setActiveTab(this.currentType); // Set initial active tab visually
        this.fetchData(this.currentType); // Initial data load
    }

    initEventListeners() {
        this.tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.setType(button.dataset.type);
            });
        });

        this.grayscaleButton.addEventListener('click', () => {
            this.toggleGrayscale();
        });

        // Placeholder for Tidal SDK initialization
        if (this.options.tidalKey) {
            this.initTidal();
        }
    }

    setLoading(isLoading) {
         if (isLoading) {
            this.widgetElement.classList.add('loading');
         } else {
             this.widgetElement.classList.remove('loading');
         }
    }

    async fetchData(type) {
        this.setLoading(true);
        this.playcountElement.textContent = ''; // Clear playcount on new fetch
        let apiUrl;
        const baseUrl = 'https://ws.audioscrobbler.com/2.0/?format=json';
        const commonParams = `&user=${this.options.username}&api_key=${this.options.apiKey}`;

        switch (type) {
            case 'recent':
                apiUrl = `${baseUrl}&method=user.getrecenttracks${commonParams}&limit=1`;
                break;
            case 'track':
                apiUrl = `${baseUrl}&method=user.gettoptracks${commonParams}&period=${this.options.period}&limit=1`;
                break;
            case 'album':
                apiUrl = `${baseUrl}&method=user.gettopalbums${commonParams}&period=${this.options.period}&limit=1`;
                break;
            case 'artist':
                apiUrl = `${baseUrl}&method=user.gettopartists${commonParams}&period=${this.options.period}&limit=1`;
                break;
            default:
                console.error(`Invalid data type requested: ${type}`);
                this.showError("Invalid type.");
                this.setLoading(false);
                return;
        }

        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            if (data.error) {
                 throw new Error(`Last.fm API Error: ${data.message}`);
            }

            this.updateUI(data, type);

        } catch (error) {
            console.error('Error fetching Last.fm data:', error);
            this.showError(`Error: ${error.message}`);
        } finally {
            this.setLoading(false);
        }
    }

    updateUI(data, type) {
        let titleText = 'N/A';
        let subtitleText = '';
        let imageUrl = this.options.placeholderImage;
        let playcount = '';

        try {
            switch (type) {
                case 'recent':
                    if (data.recenttracks && data.recenttracks.track && data.recenttracks.track.length > 0) {
                        const track = data.recenttracks.track[0];
                        titleText = track.name;
                        subtitleText = track.artist['#text'];
                        // Check for "now playing" status
                         const isNowPlaying = track['@attr'] && track['@attr'].nowplaying === 'true';
                         // You could add a visual indicator for now playing if desired
                         // subtitleText = isNowPlaying ? `${subtitleText} (Now Playing)` : subtitleText;
                        imageUrl = this.getImageUrl(track.image) || imageUrl;
                    } else {
                        titleText = "No recent tracks";
                    }
                    break;
                case 'track':
                     if (data.toptracks && data.toptracks.track && data.toptracks.track.length > 0) {
                        const track = data.toptracks.track[0];
                        titleText = track.name;
                        subtitleText = track.artist.name;
                        playcount = `${track.playcount} plays`;
                        imageUrl = this.getImageUrl(track.image) || imageUrl;
                     } else {
                         titleText = "No top track data";
                     }
                    break;
                case 'album':
                     if (data.topalbums && data.topalbums.album && data.topalbums.album.length > 0) {
                        const album = data.topalbums.album[0];
                        titleText = album.name;
                        subtitleText = album.artist.name;
                        playcount = `${album.playcount} plays`;
                        imageUrl = this.getImageUrl(album.image) || imageUrl;
                     } else {
                        titleText = "No top album data";
                    }
                    break;
                case 'artist':
                    if (data.topartists && data.topartists.artist && data.topartists.artist.length > 0) {
                        const artist = data.topartists.artist[0];
                        titleText = artist.name;
                        subtitleText = ''; // No subtitle needed for artist usually
                        playcount = `${artist.playcount} plays`;
                        imageUrl = this.getImageUrl(artist.image) || imageUrl;
                    } else {
                         titleText = "No top artist data";
                    }
                    break;
            }
        } catch (parseError) {
             console.error("Error parsing Last.fm data structure:", parseError, data);
             this.showError("Data parsing error.");
             return; // Exit early if parsing fails
        }


        this.titleElement.textContent = titleText;
        this.titleElement.title = titleText; // Add tooltip for long text
        this.subtitleElement.textContent = subtitleText;
        this.subtitleElement.title = subtitleText;
        this.playcountElement.textContent = playcount;
        this.imageElement.src = imageUrl;
        this.imageElement.alt = `${titleText} - ${subtitleText || 'Artwork'}`; // Better alt text
    }

     // Helper to get the largest available image URL
     getImageUrl(images) {
        if (!Array.isArray(images)) return null;
        // Last.fm images sizes: small, medium, large, extralarge
        // Index 3 is usually 'extralarge', index 2 'large'
        const preferredSizes = ['extralarge', 'large', 'medium', 'small'];
        for (const size of preferredSizes) {
            const img = images.find(img => img.size === size);
            if (img && img['#text']) {
                return img['#text'];
            }
        }
        // Fallback to the last image in the array if specific sizes aren't found
        if (images.length > 0 && images[images.length - 1]['#text']) {
             return images[images.length - 1]['#text'];
        }
        return null;
    }

    showError(message) {
        this.titleElement.textContent = message || 'Error loading data.';
        this.subtitleElement.textContent = '';
        this.playcountElement.textContent = '';
        this.imageElement.src = this.options.placeholderImage;
        this.imageElement.alt = 'Error loading artwork';
        console.warn("Widget Error State:", message); // Log warning in console
    }

    setActiveTab(type) {
        this.tabButtons.forEach(button => {
            if (button.dataset.type === type) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    }

    // --- Programmatic API ---

    setType(type) {
        if (type !== this.currentType && ['recent', 'track', 'album', 'artist'].includes(type)) {
            this.currentType = type;
            this.setActiveTab(type);
            this.fetchData(type);
        } else if (!['recent', 'track', 'album', 'artist'].includes(type)) {
            console.warn(`Attempted to set invalid type: ${type}`);
        }
    }

    toggleGrayscale() {
        this.isGrayscale = !this.isGrayscale;
        this.imageElement.classList.toggle('grayscale', this.isGrayscale);
        this.grayscaleButton.classList.toggle('active', this.isGrayscale);
    }

    refresh() {
        this.fetchData(this.currentType);
    }

    setCredentials(apiKey, username) {
        if (apiKey) this.options.apiKey = apiKey;
        if (username) this.options.username = username;
        console.log("Widget credentials updated. Refreshing data.");
        this.refresh();
    }


    // --- Tidal Integration Groundwork ---

    initTidal() {
        console.log("Initializing Tidal SDK (Placeholder)...");
        // Check if Tidal SDK is loaded
        // if (typeof Tidal === 'undefined') {
        //     console.error("Tidal SDK script not found.");
        //     return;
        // }

        // try {
        //     const tidal = new Tidal.Player({
        //         apiKey: this.options.tidalKey,
        //         // ... other Tidal config options
        //     });

        //     tidal.on('ready', () => {
        //         console.log('Tidal Player Ready');
        //         // Store tidal instance if needed: this.tidalPlayer = tidal;
        //     });

        //     tidal.on('error', (error) => {
        //          console.error('Tidal Player Error:', error);
        //     });

        //     // Add event listeners for Tidal playback state, track changes, etc.
        //     // tidal.on('playbackStateChanged', (state) => { /* ... */ });
        //     // tidal.on('trackChanged', (track) => { /* ... */ });

        // } catch (error) {
        //     console.error("Failed to initialize Tidal SDK:", error);
        // }
    }

    // Example function to link Tidal functionality (needs actual SDK)
    // async loadTidalPlaylist(playlistId) {
    //     if (!this.tidalPlayer) {
    //         console.warn("Tidal Player not initialized.");
    //         return;
    //     }
    //     try {
    //         // const playlist = await this.tidalPlayer.loadPlaylist(playlistId);
    //         // console.log("Loaded Tidal Playlist:", playlist);
    //         // Update UI or store playlist data
    //     } catch (error) {
    //         console.error(`Failed to load Tidal playlist ${playlistId}:`, error);
    //     }
    // }

    // Example function for potential future 
    // syncWithTidalPlayback() {
    //     if (!this.tidalPlayer) return;
    //     // Use tidalPlayer events to update the widget in real-time
    //     // e.g., if Tidal track changes, update the 'Currently Listening' tab
    // }
}
