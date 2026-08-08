# CMS Setup Guide for Project Management System

## Overview
This guide shows you how to set up a Content Management System (CMS) that automatically publishes project webpages without manual uploading through cPanel.

## Option 1: Server-Side CMS (Recommended for Production)

### Setup with PHP Backend

1. **Create a PHP API endpoint** (`api/publish-project.php`):
```php
<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    $filename = $data['filename'];
    $content = $data['content'];
    $projectData = $data['projectData'];
    
    // Save the HTML file
    $filepath = "../projects/" . $filename;
    if (file_put_contents($filepath, $content)) {
        // Update project database
        updateProjectDatabase($projectData);
        
        echo json_encode(['success' => true, 'message' => 'Project published successfully']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Failed to save project']);
    }
}

function updateProjectDatabase($projectData) {
    // Update your project database/storage
    // This could be JSON, SQL, or any storage method
}
?>
```

2. **Modify the admin system** to use the API:
```javascript
async publishToServer(filename, content, projectData) {
    try {
        const response = await fetch('api/publish-project.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                filename: filename,
                content: content,
                projectData: projectData
            })
        });
        
        const result = await response.json();
        if (result.success) {
            this.showAlert('Project published to website!', 'success');
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Publishing error:', error);
        this.showAlert('Failed to publish. Please try again.', 'danger');
    }
}
```

## Option 2: Static Site Generator with Auto-Deploy

### Setup with Jekyll/Hugo + GitHub Actions

1. **Convert to Jekyll structure**:
```
your-site/
├── _posts/
│   └── projects/
│       ├── 2024-01-15-project-1.md
│       └── 2024-01-16-project-2.md
├── _layouts/
│   └── project.html
├── _config.yml
└── index.html
```

2. **Create GitHub Actions workflow** (`.github/workflows/deploy.yml`):
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Ruby
      uses: ruby/setup-ruby@v1
      with:
        ruby-version: 3.0
        
    - name: Install Jekyll
      run: |
        gem install jekyll bundler
        bundle install
        
    - name: Build site
      run: bundle exec jekyll build
      
    - name: Deploy to GitHub Pages
      uses: peaceiris/actions-gh-pages@v3
      with:
        github_token: ${{ secrets.GITHUB_TOKEN }}
        publish_dir: ./_site
```

3. **Modify admin to create Jekyll posts**:
```javascript
generateJekyllPost(projectData) {
    const date = new Date().toISOString().split('T')[0];
    const filename = `${date}-${projectData.urlSlug}.md`;
    
    const content = `---
layout: project
title: "${projectData.title}"
category: "${projectData.category}"
date: ${date}
authors: ${JSON.stringify(projectData.authors)}
image: "${projectData.image}"
---

${projectData.description}
`;
    
    return { filename, content };
}
```

## Option 3: Client-Side CMS with Auto-Sync

### Setup with Local Web Server

1. **Install a local web server** (like Live Server in VS Code)

2. **Configure directory structure**:
```
your-website/
├── cms-admin/
│   └── project-admin.html
├── projects/
│   ├── project-1.html
│   └── project-2.html
├── assets/
└── index.html
```

3. **Use File System Access API** (modern browsers):
```javascript
async setupCMSDirectory() {
    try {
        // Request permission to access the projects directory
        const dirHandle = await window.showDirectoryPicker({
            mode: 'readwrite',
            startIn: './projects'
        });
        
        // Store the directory handle for future use
        this.cmsDirectory = dirHandle;
        
        this.showAlert('CMS directory connected!', 'success');
    } catch (error) {
        console.error('Failed to setup CMS directory:', error);
    }
}

async saveToCMS(filename, content) {
    if (!this.cmsDirectory) {
        await this.setupCMSDirectory();
    }
    
    try {
        const fileHandle = await this.cmsDirectory.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        
        this.showAlert(`Project published: ${filename}`, 'success');
    } catch (error) {
        console.error('Failed to save to CMS:', error);
        this.showAlert('Failed to publish. Please try again.', 'danger');
    }
}
```

## Option 4: Cloud-Based CMS

### Setup with Netlify/Vercel + API

1. **Create a serverless function** (for Netlify):
```javascript
// netlify/functions/publish-project.js
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    
    const { filename, content, projectData } = JSON.parse(event.body);
    
    try {
        // Save to your hosting platform's file system
        // This would depend on your hosting provider's API
        
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: 'Project published' })
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.message })
        };
    }
};
```

## Recommended Setup for Your Use Case

### For cPanel Hosting:

1. **Use Option 1 (PHP Backend)** - This is the most reliable for cPanel hosting
2. **Create the API endpoint** in your cPanel hosting
3. **Modify the admin system** to use the API instead of file downloads
4. **Set up automatic deployment** through the API

### Implementation Steps:

1. **Upload the PHP API** to your cPanel hosting
2. **Modify the admin system** to call the API
3. **Test the publishing system**
4. **Set up any necessary database/storage**

### Benefits:
- ✅ No manual uploading required
- ✅ Instant publishing
- ✅ Version control
- ✅ Backup and recovery
- ✅ Professional workflow

## Security Considerations

1. **API Authentication**: Add authentication to your API endpoints
2. **File Validation**: Validate all uploaded content
3. **Rate Limiting**: Prevent abuse of the publishing system
4. **Backup System**: Automatically backup published content

## Next Steps

1. Choose the option that best fits your hosting setup
2. Implement the chosen solution
3. Test thoroughly
4. Deploy to production

Would you like me to implement any of these specific options for your setup?

