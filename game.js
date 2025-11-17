// Game Configuration
const GAME_WIDTH = 1920;
const GAME_HEIGHT = 1080;
const PLAYER_SPEED = 4;
const TILE_SIZE = 32;

// Canvas Setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = GAME_WIDTH;
canvas.height = GAME_HEIGHT;

// Input Handler
const keys = {};
window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

// Player Class with Animation
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = TILE_SIZE;
        this.height = TILE_SIZE;
        this.velocityX = 0;
        this.velocityY = 0;
        this.direction = 'down';
        this.isMoving = false;
        this.animationFrame = 0;
        this.animationSpeed = 0.15;
        this.frameCount = 4;
    }

    update() {
        // Reset velocity and movement state
        this.velocityX = 0;
        this.velocityY = 0;
        this.isMoving = false;

        // 4-directional movement only (no diagonal) - prioritize WASD over arrows
        if (keys['w']) {
            this.velocityY = -PLAYER_SPEED;
            this.direction = 'up';
            this.isMoving = true;
        } else if (keys['s']) {
            this.velocityY = PLAYER_SPEED;
            this.direction = 'down';
            this.isMoving = true;
        } else if (keys['a']) {
            this.velocityX = -PLAYER_SPEED;
            this.direction = 'left';
            this.isMoving = true;
        } else if (keys['d']) {
            this.velocityX = PLAYER_SPEED;
            this.direction = 'right';
            this.isMoving = true;
        } else if (keys['arrowup']) {
            this.velocityY = -PLAYER_SPEED;
            this.direction = 'up';
            this.isMoving = true;
        } else if (keys['arrowdown']) {
            this.velocityY = PLAYER_SPEED;
            this.direction = 'down';
            this.isMoving = true;
        } else if (keys['arrowleft']) {
            this.velocityX = -PLAYER_SPEED;
            this.direction = 'left';
            this.isMoving = true;
        } else if (keys['arrowright']) {
            this.velocityX = PLAYER_SPEED;
            this.direction = 'right';
            this.isMoving = true;
        }

        // Calculate new position
        const newX = this.x + this.velocityX;
        const newY = this.y + this.velocityY;

        // Screen boundary collision only
        if (newX >= 0 && newX + this.width <= GAME_WIDTH) {
            this.x = newX;
        }
        if (newY >= 0 && newY + this.height <= GAME_HEIGHT) {
            this.y = newY;
        }

        // Update animation
        if (this.isMoving) {
            this.animationFrame += this.animationSpeed;
            if (this.animationFrame >= this.frameCount) {
                this.animationFrame = 0;
            }
        } else {
            this.animationFrame = 0;
        }
    }

    draw(ctx) {
        ctx.save();
        
        // Simple body
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(this.x + 6, this.y + 8, 20, 18);
        
        // Head
        ctx.fillStyle = '#ffe0bd';
        ctx.fillRect(this.x + 8, this.y + 4, 16, 12);
        
        // Eyes that change based on direction
        ctx.fillStyle = '#000';
        if (this.direction === 'left') {
            ctx.fillRect(this.x + 8, this.y + 8, 4, 2);
        } else if (this.direction === 'right') {
            ctx.fillRect(this.x + 18, this.y + 8, 4, 2);
        } else {
            ctx.fillRect(this.x + 10, this.y + 8, 2, 2);
            ctx.fillRect(this.x + 18, this.y + 8, 2, 2);
        }
        
        // Walking animation bounce
        if (this.isMoving) {
            const bounce = Math.sin(this.animationFrame * Math.PI * 2) * 2;
            ctx.translate(0, -bounce);
        }
        
        // Feet animation
        ctx.fillStyle = '#333';
        const footOffset = Math.sin(this.animationFrame * Math.PI * 2) * 2;
        if (this.isMoving) {
            ctx.fillRect(this.x + 6 + footOffset, this.y + 24, 6, 4);
            ctx.fillRect(this.x + 18 - footOffset, this.y + 24, 6, 4);
        } else {
            ctx.fillRect(this.x + 8, this.y + 24, 6, 4);
            ctx.fillRect(this.x + 16, this.y + 24, 6, 4);
        }
        
        ctx.restore();
    }
}

// Initialize player at center
const player = new Player(GAME_WIDTH / 2 - TILE_SIZE / 2, GAME_HEIGHT / 2 - TILE_SIZE / 2);

// Background (replace with your image)
function drawBackground() {
    // Solid background color
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    
    // Optional: Add subtle grid pattern for positioning reference
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < GAME_WIDTH; x += TILE_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, GAME_HEIGHT);
        ctx.stroke();
    }
    for (let y = 0; y < GAME_HEIGHT; y += TILE_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(GAME_WIDTH, y);
        ctx.stroke();
    }
}

// Game Loop
function gameLoop() {
    // Draw background (replace with your image later)
    drawBackground();
    
    // Update and draw player
    player.update();
    player.draw(ctx);
    
    // Draw UI info
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.fillText(`Tournament Arena - Use WASD or Arrow Keys`, 20, 40);
    ctx.fillText(`Player Position: (${Math.floor(player.x)}, ${Math.floor(player.y)})`, 20, 70);
    
    requestAnimationFrame(gameLoop);
}

// Start game
gameLoop();