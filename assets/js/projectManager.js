// Project Management System
// This file contains all project data and functions to automatically update both projects.html and index.html

const PROJECTS_DATA = [
    {
        id: "underwater-rov",
        title: "Underwater ROV",
        category: "Engineering",
        genre: "Robotics",
        description: "Senior project designing and building an underwater ROV with telemetry system for marine environment analysis and oyster farming decisions.",
        shortDescription: "In my senior year at the OL Math and Science Academy, I designed and built an underwater ROV and telemetry system to document and analyze local marine environments and aid in decisions related to farming oysters.",
        image: "assets/imgs/rov_top.jpg",
        thumbnail: "assets/imgs/rov_top.JPG",
        link: "underwaterrov.html",
        authors: ["Chase Bonfiglio"],
        individualAuthors: [
            {
                name: "Chase Bonfiglio",
                title: "Project Lead & ROV Design",
                headshot: "assets/imgs/authors/chase.jpg"
            }
        ],
        featured: true,
        photos: []
    },
    {
        id: "mousetrap-car",
        title: "Mousetrap Car",
        category: "Engineering",
        genre: "Mechanical Design",
        description: "Engineering design challenge creating a mousetrap car that demonstrates fundamental physics principles including potential energy, kinetic energy, friction, and mechanical advantage.",
        shortDescription: "Designed and constructed a mousetrap car incorporating custom 3D-printed wheels, laser-cut wooden chassis, and a CD-based drive mechanism to demonstrate physics principles.",
        image: "assets/imgs/cad/mousetrap/mouse.jpg",
        thumbnail: "assets/imgs/cad/mousetrap/mouse.jpg",
        link: "mousetrapcar.html",
        authors: ["Chase Bonfiglio"],
        individualAuthors: [
            {
                name: "Chase Bonfiglio",
                title: "Designer & Engineer",
                headshot: "assets/imgs/authors/chase.jpg"
            }
        ],
        featured: true,
        photos: []
    },
    {
        id: "asm-materials-testing",
        title: "ASM Materials Testing Device",
        category: "Engineering",
        genre: "Materials Science",
        description: "Competition project creating a device to test material properties, specifically tensile strength testing apparatus.",
        shortDescription: "For this competition, we were tasked with create a device to test a materials property. My partner and I decided to try and test tensile strength and created a device in an attempt to do so.",
        image: "assets/imgs/asm_thumbnail.jpg",
        thumbnail: "assets/imgs/asm_thumbnail.JPG",
        link: "aerospace.html",
        authors: ["Chase Bonfiglio", "Cade Martinez"],
        featured: true
    },
    {
        id: "asm-failure-analysis",
        title: "ASM Failure Analysis",
        category: "Engineering",
        genre: "Materials Science",
        description: "Eisenman Camp 2024 project analyzing truck stud failure using EDS and SEM tools to determine failure mechanisms.",
        shortDescription: "An Eisenman Camp 2024, our team was given truck stud that had failed and had to determine why and how the piece failed. We used a variety of tools for EDS (Energy Dispersive Spectroscopy) and SEM (Scanning Electron Microscopy) and presented our conclusions.",
        image: "assets/imgs/asm_microscope.jpg",
        thumbnail: "assets/imgs/asm_microscope.JPG",
        link: "aerospace.html",
        authors: ["Chase Bonfiglio", "Asher Bolotski", "Raine Dickinson", "Nicholas Burgess", "Jillian Frederick", "Calli Dehnel"],
        mentors: ["Eric Cole", "Harjot Singh"],
        featured: true
    },
    {
        id: "gearbox-1000-1",
        title: "1000:1 Gearbox",
        category: "Engineering",
        genre: "Mechanical Design",
        description: "Design and 3D printing of a gearbox with 1000:1 ratio using custom manufacturing methods and additive manufacturing.",
        shortDescription: "For this project, we were given a goal to create a gearbox with a ratio of 1000:1. We were allowed to use a our choice of manufacturing methods and our team elected to design and 3D print the gearbox.",
        image: "assets/imgs/gearbox.jpg",
        thumbnail: "assets/imgs/gearbox.JPG",
        link: "aerospace.html",
        authors: ["Chase Bonfiglio"],
        featured: true
    },
    {
        id: "mousetrap-car",
        title: "Mousetrap Car",
        category: "Engineering",
        genre: "Mechanical Design",
        description: "$25 budget mousetrap car design challenge to travel maximum distance within a 3ft linear track constraint.",
        shortDescription: "We were given a $25 budget to design and build a mousetrap car that could travel the furthest possible distance whilst staying inside a 3ft linear track.",
        image: "assets/imgs/mouse.jpg",
        thumbnail: "assets/imgs/mouse.JPG",
        link: "aerospace.html",
        authors: ["Chase Bonfiglio", "Cade Martinez"],
        featured: true
    },
    {
        id: "biomedical-device",
        title: "Biomedical Device Design",
        category: "Engineering",
        genre: "Biomedical",
        description: "Leadless pacemaker redesign research for third-degree heart block patients with 10+ year lifespan requirements.",
        shortDescription: "Leadless pacemaker redesign research for third-degree heart block patients with 10+ year lifespan requirements.",
        image: "assets/imgs/biomedical.jpg",
        thumbnail: "assets/imgs/biomedical.jpg",
        link: "aerospace.html",
        authors: ["Chase Bonfiglio"],
        featured: false
    },
    {
        id: "tsa-cad-engineering",
        title: "TSA CAD Engineering",
        category: "CAD Design",
        genre: "Computer-Aided Design",
        description: "Competition experience in TSA CAD Engineering at regional, state, and national levels with Certified SolidWorks Professional certification.",
        shortDescription: "Competition experience in TSA CAD Engineering at regional, state, and national levels with Certified SolidWorks Professional certification.",
        image: "assets/imgs/cad/parts/part10.jpg",
        thumbnail: "assets/imgs/cad/parts/part10.jpg",
        link: "cad-projects.html",
        authors: ["Chase Bonfiglio"],
        featured: true
    },
    {
        id: "mass-production-nameplate",
        title: "Mass Production Nameplate",
        category: "Manufacturing",
        genre: "CNC Manufacturing",
        description: "Standardized nameplate design for 20-unit production run using Axiom CNC router with V-Carve CAM software.",
        shortDescription: "Standardized nameplate design for 20-unit production run using Axiom CNC router with V-Carve CAM software.",
        image: "assets/imgs/IMG_6047.jpg",
        thumbnail: "assets/imgs/IMG_6047.jpg",
        link: "mass-production.html",
        authors: ["Chase Bonfiglio"],
        featured: false
    },
    {
        id: "flight-endurance-contest",
        title: "Flight Endurance Contest",
        category: "Aerospace",
        genre: "Aerospace Design",
        description: "TSA contest model plane design optimizing lift and drag reduction using CNC-cut foam wings for precision assembly.",
        shortDescription: "TSA contest model plane design optimizing lift and drag reduction using CNC-cut foam wings for precision assembly.",
        image: "assets/imgs/Plane_Flying.PNG",
        thumbnail: "assets/imgs/Plane_Flying.PNG",
        link: "aerospace.html",
        authors: ["Chase Bonfiglio"],
        featured: true
    }
];

// Project Management Functions
class ProjectManager {
    constructor() {
        this.projects = PROJECTS_DATA;
        this.currentIndex = 0;
    }

    // Get all projects
    getAllProjects() {
        return this.projects;
    }

    // Get featured projects (for homepage)
    getFeaturedProjects() {
        return this.projects.filter(project => project.featured);
    }

    // Get projects by category
    getProjectsByCategory(category) {
        return this.projects.filter(project => project.category === category);
    }

    // Get projects by genre
    getProjectsByGenre(genre) {
        return this.projects.filter(project => project.genre === genre);
    }

    // Get project by ID
    getProjectById(id) {
        return this.projects.find(project => project.id === id);
    }

    // Add new project
    addProject(projectData) {
        // Generate link based on title
        const safeTitle = projectData.title.toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        
        // Check for exceptions that should keep their existing links
        let link = `project-${safeTitle}.html`;
        if (projectData.title === "Mass Production Nameplate") {
            link = "mass-production.html";
        } else if (projectData.title === "Flight Endurance Contest") {
            link = "aerospace.html";
        } else if (projectData.title === "TSA CAD Engineering") {
            link = "cad-projects.html";
        }
        
        const newProject = {
            id: projectData.id || this.generateId(projectData.title),
            featured: projectData.featured || false,
            link: link,
            ...projectData
        };
        this.projects.push(newProject);
        this.saveToLocalStorage();
        return newProject;
    }

    // Update existing project
    updateProject(id, updates) {
        const index = this.projects.findIndex(project => project.id === id);
        if (index !== -1) {
            // Update the link based on title, with exceptions
            if (updates.title) {
                let link = `project-${updates.title.toLowerCase()
                    .replace(/[^a-z0-9]/g, '-')
                    .replace(/-+/g, '-')
                    .replace(/^-|-$/g, '')}.html`;
                
                // Check for exceptions that should keep their existing links
                if (updates.title === "Mass Production Nameplate") {
                    link = "mass-production.html";
                } else if (updates.title === "Flight Endurance Contest") {
                    link = "aerospace.html";
                } else if (updates.title === "TSA CAD Engineering") {
                    link = "cad-projects.html";
                }
                
                updates.link = link;
            }
            this.projects[index] = { ...this.projects[index], ...updates };
            this.saveToLocalStorage();
            return this.projects[index];
        }
        return null;
    }

    // Delete project
    deleteProject(id) {
        const index = this.projects.findIndex(project => project.id === id);
        if (index !== -1) {
            this.projects.splice(index, 1);
            this.saveToLocalStorage();
            return true;
        }
        return false;
    }

    // Generate unique ID from title
    generateId(title) {
        return title.toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    // Save to localStorage (for persistence)
    saveToLocalStorage() {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('projectsData', JSON.stringify(this.projects));
        }
    }

    // Load from localStorage
    loadFromLocalStorage() {
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem('projectsData');
            if (saved) {
                this.projects = JSON.parse(saved);
            }
        }
    }

    // Get left peripheral index (for projects page)
    getLeftIndex() {
        return (this.currentIndex - 1 + this.projects.length) % this.projects.length;
    }

    // Get right peripheral index (for projects page)
    getRightIndex() {
        return (this.currentIndex + 1) % this.projects.length;
    }

    // Render featured projects for homepage (index.html)
    renderFeaturedProjects() {
        const container = document.querySelector('#engineering .row');
        if (!container) return;

        // Clear existing content
        container.innerHTML = '';

        // Get featured projects
        const featuredProjects = this.getFeaturedProjects();

        // Create project cards
        featuredProjects.forEach(project => {
            const card = this.createFeaturedProjectCard(project);
            container.appendChild(card);
        });
    }

    // Create featured project card for homepage
    createFeaturedProjectCard(project) {
        const card = document.createElement('div');
        card.className = 'blog-card';
        
        const authorsText = project.authors.join(', ');
        const mentorsText = project.mentors ? `; Mentored by ${project.mentors.join(', ')}` : '';
        
        card.innerHTML = `
            <div class="img-holder">
                <img src="${project.thumbnail}" alt="${project.title}">
            </div>
            <div class="content-holder">
                <h6 class="title">${project.title}</h6>
                <p class="post-details">
                    <a href="#">By: ${authorsText}${mentorsText}</a>
                </p>
                <p>${project.shortDescription}</p>
                <a href="${project.link}" class="read-more">Read more <i class="ti-angle-double-right"></i></a>
            </div>
        `;
        
        return card;
    }

    // Initialize the project manager
    init() {
        // Clear localStorage to force fresh data
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('projectsData');
        }
        
        this.loadFromLocalStorage();
        
        // Check if we're on homepage
        if (document.querySelector('#engineering .row')) {
            this.renderFeaturedProjects();
        }
    }


}

// Create global instance
const projectManager = new ProjectManager();

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    projectManager.init();
});

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ProjectManager, PROJECTS_DATA };
}
