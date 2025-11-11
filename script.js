// Initialize Supabase client
        const SUPABASE_URL = 'https://mrpqncghsrhkurusudud.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ycHFuY2doc3Joa3VydXN1ZHVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NjU2OTUsImV4cCI6MjA3ODM0MTY5NX0.eQeChJ2ff1IuUOcm3D--iwG7bVlUE7JEElAZmGgDyiI';
        
        const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // Crypto utilities
        async function generateHashcode(password) {
            const timestamp = Date.now().toString();
            const data = password + timestamp;
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(data);
            const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return hashHex.substring(0, 32);
        }

        async function hashSecretCode(secretCode) {
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(secretCode);
            const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        function encryptPassword(password, secretCode) {
            const encoder = new TextEncoder();
            const passwordBytes = encoder.encode(password);
            const keyBytes = encoder.encode(secretCode);
            
            const encrypted = new Uint8Array(passwordBytes.length);
            for (let i = 0; i < passwordBytes.length; i++) {
                encrypted[i] = passwordBytes[i] ^ keyBytes[i % keyBytes.length];
            }
            
            return btoa(String.fromCharCode(...encrypted));
        }

        function decryptPassword(encryptedPassword, secretCode) {
            const decoder = new TextDecoder();
            const encoder = new TextEncoder();
            
            const encrypted = Uint8Array.from(atob(encryptedPassword), c => c.charCodeAt(0));
            const keyBytes = encoder.encode(secretCode);
            
            const decrypted = new Uint8Array(encrypted.length);
            for (let i = 0; i < encrypted.length; i++) {
                decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
            }
            
            return decoder.decode(decrypted);
        }

        // UI functions
        function switchTab(tab) {
            const buttons = document.querySelectorAll('.tab-button');
            const contents = document.querySelectorAll('.tab-content');
            
            buttons.forEach(btn => btn.classList.remove('active'));
            contents.forEach(content => content.classList.remove('active'));
            
            if (tab === 'encode') {
                buttons[0].classList.add('active');
                document.getElementById('encode-tab').classList.add('active');
            } else {
                buttons[1].classList.add('active');
                document.getElementById('decode-tab').classList.add('active');
            }
        }

        function showToast(message, type = 'success') {
            const toast = document.getElementById('toast');
            const toastMessage = document.getElementById('toastMessage');
            
            toastMessage.textContent = message;
            toast.className = `toast ${type} show`;
            
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }

        async function handleEncode(event) {
            event.preventDefault();
            
            const password = document.getElementById('password').value;
            const secretCode = document.getElementById('secretCode').value;
            const button = document.getElementById('encodeBtn');
            
            if (!password || !secretCode) {
                showToast('Please enter both password and secret code', 'error');
                return;
            }
            
            button.disabled = true;
            button.innerHTML = '<div class="spinner"></div> Processing...';
            
            try {
                const hashcode = await generateHashcode(password);
                const secretCodeHash = await hashSecretCode(secretCode);
                const encryptedPassword = encryptPassword(password, secretCode);
                
                // Store in Supabase
                const { error } = await supabase
                    .from('secure_passwords')
                    .insert({
                        hashcode: hashcode,
                        encrypted_password: encryptedPassword,
                        secret_code_hash: secretCodeHash
                    });
                
                if (error) {
                    console.error('Supabase error:', error);
                    throw error;
                }
                
                // Create download file
                const fileContent = `WhisperKey Lock - Secure Password Share
════════════════════════════════════════

Hashcode: ${hashcode}
Secret Code: ${secretCode}

⚠️ IMPORTANT: Keep this information safe!
Share the Hashcode and Secret Code separately for maximum security.
This password will expire in 7 days.

💝 Share with trust and care
`;
                
                const blob = new Blob([fileContent], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `whisperkey-${hashcode.substring(0, 8)}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                showToast('Password encrypted! File downloaded. ✨', 'success');
                document.getElementById('password').value = '';
                document.getElementById('secretCode').value = '';
            } catch (error) {
                console.error('Error encoding password:', error);
                showToast('Failed to encrypt password. Please try again.', 'error');
            } finally {
                button.disabled = false;
                button.innerHTML = `
                    <svg class="icon icon-sm" viewBox="0 0 24 24">
                        <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    Create Secure Code
                `;
            }
        }

        async function handleDecode(event) {
            event.preventDefault();
            
            const hashcode = document.getElementById('hashcode').value.trim();
            const secretCode = document.getElementById('secretCodeUnlock').value;
            const button = document.getElementById('decodeBtn');
            const resultBox = document.getElementById('result');
            
            if (!hashcode || !secretCode) {
                showToast('Please enter both hashcode and secret code', 'error');
                return;
            }
            
            button.disabled = true;
            button.innerHTML = '<div class="spinner"></div> Unlocking...';
            
            try {
                const secretCodeHash = await hashSecretCode(secretCode);
                
                // Retrieve from Supabase
                const { data, error } = await supabase
                    .from('secure_passwords')
                    .select('*')
                    .eq('hashcode', hashcode)
                    .eq('secret_code_hash', secretCodeHash)
                    .maybeSingle();
                
                if (error) {
                    console.error('Supabase error:', error);
                    throw error;
                }
                
                if (!data) {
                    showToast('Invalid hashcode or secret code 🔒', 'error');
                    resultBox.style.display = 'none';
                    return;
                }
                
                const decrypted = decryptPassword(data.encrypted_password, secretCode);
                document.getElementById('unlockedPassword').value = decrypted;
                resultBox.style.display = 'block';
                showToast('Password unlocked successfully! ✨', 'success');
            } catch (error) {
                console.error('Error decoding password:', error);
                showToast('Failed to unlock password. Please try again.', 'error');
                resultBox.style.display = 'none';
            } finally {
                button.disabled = false;
                button.innerHTML = `
                    <svg class="icon icon-sm" viewBox="0 0 24 24">
                        <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                    </svg>
                    Reveal Password
                `;
            }
        }

        function copyPassword() {
            const input = document.getElementById('unlockedPassword');
            navigator.clipboard.writeText(input.value);
            showToast('Password copied to clipboard! 📋', 'success');
        }