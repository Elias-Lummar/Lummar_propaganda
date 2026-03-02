# Advertisement Management System - TODO

## Project Structure
```
/workspace/html_template/
├── server.js                 # Main Express server
├── package.json             # Dependencies and scripts
├── db/
│   └── database.js          # SQLite database setup
├── routes/
│   ├── admin.js            # Admin API routes
│   └── ads.js              # Advertisement API routes
├── public/
│   ├── admin.html          # Admin panel interface
│   ├── presenter.html      # Display page for TV
│   ├── css/
│   │   ├── admin.css       # Admin panel styles
│   │   └── presenter.css   # Presenter page styles
│   ├── js/
│   │   ├── admin.js        # Admin panel functionality
│   │   └── presenter.js
            admin.js
            preload.js      # Presenter page functionality
│   └── uploads/            # Directory for uploaded files
└── README.md               # Project documentation
```

## Database Schema
- Table: ads
  - id (INTEGER PRIMARY KEY AUTOINCREMENT)
  - title (TEXT)
  - file_path (TEXT)
  - start_time (DATETIME)
  - end_time (DATETIME)
  - transition_type (TEXT)
  - transition_duration (INTEGER)
  - screens: (TEXT)

## Features to Implement
1. ✅ Express server with SQLite database
2. ✅ File upload functionality with Multer
3. ✅ Admin panel with CRUD operations
4. ✅ Presenter page with transition effects
5. ✅ Responsive design
6. ✅ Full-screen TV display support

## API Endpoints
- GET /admin - Admin panel page
- GET /presenter - Presenter page
- GET /api/ads - Get all ads
- GET /api/ads/active - Get active ads
- POST /api/ads - Create new ad
- PUT /api/ads/:id - Update ad
- DELETE /api/ads/:id - Delete ad
- POST /api/upload - Upload file

## Transition Effects
- fade: Opacity transition
- slide: Slide from left/right
- smoke: Smooth disappear effect
- blink: Direct switch without animation