/**
 * Stack-Aware Pattern Templates
 *
 * Language/framework-specific code patterns, project structure guidance,
 * and idiomatic examples for non-JS stacks.
 *
 * @module templates/stack-patterns
 */

import type { Framework } from "../types.js";

export interface StackSection {
  title: string;
  content: string;
}

/**
 * Returns stack-specific pattern sections for the generated context file.
 * Returns null for JS/TS stacks (handled by existing component/hook sections).
 */
export function getStackPatternSections(framework: Framework): StackSection[] {
  switch (framework.language) {
    case "Python":
      return getPythonSections(framework);
    case "Go":
      return getGoSections(framework);
    case "Rust":
      return getRustSections(framework);
    case "Java":
    case "Kotlin":
      return getJvmSections(framework);
    default:
      return [];
  }
}

// ─── Python ──────────────────────────────────────────────────────────────────

function getPythonSections(framework: Framework): StackSection[] {
  const sections: StackSection[] = [];

  sections.push({
    title: "Project Structure",
    content: getPythonStructure(framework),
  });

  sections.push({
    title: "Code Patterns",
    content: getPythonPatterns(framework),
  });

  return sections;
}

function getPythonStructure(framework: Framework): string {
  if (framework.name === "FastAPI") {
    return `\`\`\`
app/
├── main.py          # FastAPI app entry, router registration
├── dependencies.py  # Shared dependencies (get_db, get_current_user)
├── models/          # SQLAlchemy ORM models
├── schemas/         # Pydantic request/response schemas
├── routers/         # APIRouter modules by domain
├── services/        # Business logic (called from routers)
└── core/
    ├── config.py    # Settings via pydantic-settings
    └── database.py  # DB engine + session factory
\`\`\``;
  }

  if (framework.name === "Django") {
    return `\`\`\`
project/
├── manage.py
├── config/
│   ├── settings/    # base.py, development.py, production.py
│   ├── urls.py      # root URL configuration
│   └── wsgi.py
└── apps/
    └── <app_name>/
        ├── models.py
        ├── views.py
        ├── serializers.py   # DRF: request/response schemas
        ├── urls.py          # app-level URL routing
        ├── services.py      # business logic (not in views)
        ├── tests/
        └── migrations/
\`\`\``;
  }

  if (framework.name === "Flask") {
    return `\`\`\`
app/
├── __init__.py      # create_app() factory function
├── config.py        # Config classes (Development, Production)
├── extensions.py    # db, login_manager, etc.
├── models/          # SQLAlchemy models
├── blueprints/      # Route modules (users/routes.py, items/routes.py)
└── services/        # Business logic
\`\`\``;
  }

  // Generic Python
  return `\`\`\`
src/
├── __init__.py
├── main.py
├── models/
├── services/
└── tests/
\`\`\``;
}

function getPythonPatterns(framework: Framework): string {
  if (framework.name === "FastAPI") {
    return `### Endpoint Pattern

\`\`\`python
from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas import ItemCreate, ItemResponse
from app.dependencies import get_db, get_current_user
from app.services import item_service
from sqlalchemy.orm import Session

router = APIRouter(prefix="/items", tags=["items"])

@router.post("/", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
async def create_item(
    payload: ItemCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> ItemResponse:
    return await item_service.create(db, payload, owner_id=current_user.id)
\`\`\`

### Settings Pattern

\`\`\`python
# core/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    secret_key: str
    debug: bool = False

    class Config:
        env_file = ".env"

settings = Settings()
\`\`\`

### Error Handling

\`\`\`python
from fastapi import HTTPException, status

# In route or service — raise HTTP exceptions, not bare Exceptions
raise HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="Item not found",
)
\`\`\``;
  }

  if (framework.name === "Django") {
    return `### View Pattern (DRF)

\`\`\`python
from rest_framework import serializers, viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import Item
from .services import item_service

class ItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = Item
        fields = ["id", "name", "created_at"]
        read_only_fields = ["id", "created_at"]

class ItemViewSet(viewsets.ModelViewSet):
    queryset = Item.objects.select_related("owner").all()
    serializer_class = ItemSerializer

    def perform_create(self, serializer):
        item_service.create(serializer.validated_data, owner=self.request.user)
\`\`\`

### Model Pattern

\`\`\`python
from django.db import models

class Item(models.Model):
    owner = models.ForeignKey("auth.User", on_delete=models.CASCADE, related_name="items")
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["owner", "created_at"])]
\`\`\``;
  }

  if (framework.name === "Flask") {
    return `### Blueprint Pattern

\`\`\`python
# blueprints/items/routes.py
from flask import Blueprint, request, jsonify
from app.services import item_service
from app.extensions import db

bp = Blueprint("items", __name__, url_prefix="/api/items")

@bp.post("/")
def create_item():
    data = request.get_json(force=True)
    item = item_service.create(db.session, data)
    return jsonify(item.to_dict()), 201

@bp.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found"}), 404
\`\`\`

### App Factory

\`\`\`python
# __init__.py
from flask import Flask
from .extensions import db, migrate
from .blueprints.items.routes import bp as items_bp

def create_app(config_name="development"):
    app = Flask(__name__)
    app.config.from_object(f"app.config.{config_name.capitalize()}Config")
    db.init_app(app)
    migrate.init_app(app, db)
    app.register_blueprint(items_bp)
    return app
\`\`\``;
  }

  // Generic Python
  return `### Type-Annotated Function Pattern

\`\`\`python
from typing import Optional

def process(value: str, limit: Optional[int] = None) -> list[str]:
    results: list[str] = []
    for item in value.split():
        if limit and len(results) >= limit:
            break
        results.append(item.strip())
    return results
\`\`\``;
}

// ─── Go ───────────────────────────────────────────────────────────────────────

function getGoSections(framework: Framework): StackSection[] {
  return [
    {
      title: "Project Structure",
      content: getGoStructure(framework),
    },
    {
      title: "Code Patterns",
      content: getGoPatterns(framework),
    },
  ];
}

function getGoStructure(framework: Framework): string {
  const hasWebFramework = ["Gin", "Echo", "Fiber", "Gorilla Mux"].includes(framework.name);
  if (hasWebFramework) {
    return `\`\`\`
cmd/
└── server/
    └── main.go        # Entry point: wire dependencies, start HTTP server
internal/
├── handler/           # HTTP handlers (thin — delegate to service)
├── service/           # Business logic
├── repository/        # Data access layer
├── model/             # Domain types
├── middleware/        # HTTP middleware (auth, logging, recovery)
└── config/            # Config loading (env/viper)
pkg/                   # Exported reusable packages
go.mod
go.sum
\`\`\``;
  }

  return `\`\`\`
cmd/
└── <name>/
    └── main.go
internal/
├── <domain>/
│   ├── service.go
│   └── repository.go
└── config/
pkg/
go.mod
\`\`\``;
}

function getGoPatterns(framework: Framework): string {
  const handlerFramework = framework.name === "Gin"
    ? getGinPattern()
    : framework.name === "Echo"
      ? getEchoPattern()
      : framework.name === "Fiber"
        ? getFiberPattern()
        : getNetHttpPattern();

  return `### Error Handling

\`\`\`go
// Define sentinel errors in your domain package
var (
    ErrNotFound   = errors.New("not found")
    ErrUnauthorized = errors.New("unauthorized")
)

// Return errors up — handle once at the boundary (handler or main)
func (s *ItemService) Get(ctx context.Context, id int64) (*Item, error) {
    item, err := s.repo.FindByID(ctx, id)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return nil, fmt.Errorf("item %d: %w", id, ErrNotFound)
        }
        return nil, fmt.Errorf("get item: %w", err)
    }
    return item, nil
}
\`\`\`

${handlerFramework}

### Dependency Injection Pattern

\`\`\`go
// Wire dependencies in main — no global state
func main() {
    db, _ := sql.Open("postgres", os.Getenv("DATABASE_URL"))
    repo := repository.New(db)
    svc := service.New(repo)
    h := handler.New(svc)
    // register routes with h...
}
\`\`\``;
}

function getGinPattern(): string {
  return `### Gin Handler Pattern

\`\`\`go
type ItemHandler struct{ svc *service.ItemService }

func (h *ItemHandler) Create(c *gin.Context) {
    var req CreateItemRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    item, err := h.svc.Create(c.Request.Context(), req)
    if err != nil {
        if errors.Is(err, service.ErrConflict) {
            c.JSON(http.StatusConflict, gin.H{"error": "already exists"})
            return
        }
        c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
        return
    }
    c.JSON(http.StatusCreated, item)
}
\`\`\``;
}

function getEchoPattern(): string {
  return `### Echo Handler Pattern

\`\`\`go
func (h *ItemHandler) Create(c echo.Context) error {
    var req CreateItemRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }
    if err := c.Validate(&req); err != nil {
        return echo.NewHTTPError(http.StatusUnprocessableEntity, err.Error())
    }
    item, err := h.svc.Create(c.Request().Context(), req)
    if err != nil {
        return err  // Echo error middleware handles mapping
    }
    return c.JSON(http.StatusCreated, item)
}
\`\`\``;
}

function getFiberPattern(): string {
  return `### Fiber Handler Pattern

\`\`\`go
func (h *ItemHandler) Create(c *fiber.Ctx) error {
    var req CreateItemRequest
    if err := c.BodyParser(&req); err != nil {
        return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
    }
    item, err := h.svc.Create(c.Context(), req)
    if err != nil {
        return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
    }
    return c.Status(fiber.StatusCreated).JSON(item)
}
\`\`\``;
}

function getNetHttpPattern(): string {
  return `### net/http Handler Pattern

\`\`\`go
func (h *ItemHandler) Create(w http.ResponseWriter, r *http.Request) {
    var req CreateItemRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    item, err := h.svc.Create(r.Context(), req)
    if err != nil {
        http.Error(w, "internal error", http.StatusInternalServerError)
        return
    }
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(item)
}
\`\`\``;
}

// ─── Rust ─────────────────────────────────────────────────────────────────────

function getRustSections(framework: Framework): StackSection[] {
  return [
    {
      title: "Project Structure",
      content: getRustStructure(framework),
    },
    {
      title: "Code Patterns",
      content: getRustPatterns(framework),
    },
  ];
}

function getRustStructure(framework: Framework): string {
  const hasWebFramework = ["Axum", "Actix Web", "Rocket", "Warp"].includes(framework.name);
  if (hasWebFramework) {
    return `\`\`\`
src/
├── main.rs            # Entry point: build router, bind listener
├── error.rs           # AppError type (thiserror) + IntoResponse impl
├── state.rs           # AppState struct (db pool, config)
├── routes/            # Router builders per domain
│   └── items.rs
├── handlers/          # Handler functions (thin — delegate to services)
├── services/          # Business logic
├── models/            # Domain structs
└── db/                # Query functions (sqlx) or ORM models
\`\`\``;
  }

  return `\`\`\`
src/
├── main.rs
├── error.rs       # Error types (thiserror)
├── lib.rs         # Library root (if dual bin+lib)
└── <module>.rs
\`\`\``;
}

function getRustPatterns(framework: Framework): string {
  const handlerSection = framework.name === "Axum"
    ? getAxumPattern()
    : framework.name === "Actix Web"
      ? getActixPattern()
      : getRocketPattern();

  return `### Error Type Pattern

\`\`\`rust
// error.rs — define once, use everywhere
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("unauthorized")]
    Unauthorized,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
\`\`\`

${handlerSection}

### Service Layer Pattern

\`\`\`rust
impl ItemService {
    pub async fn create(&self, payload: CreateItemRequest) -> Result<Item, AppError> {
        // Validate
        if payload.name.trim().is_empty() {
            return Err(AppError::Validation("name cannot be empty".into()));
        }
        // Persist
        let item = sqlx::query_as!(Item,
            "INSERT INTO items (name) VALUES ($1) RETURNING *",
            payload.name
        )
        .fetch_one(&self.pool)
        .await?;  // AppError::Database via #[from]
        Ok(item)
    }
}
\`\`\``;
}

function getAxumPattern(): string {
  return `### Axum Handler Pattern

\`\`\`rust
use axum::{extract::{Path, State}, http::StatusCode, Json};

async fn create_item(
    State(state): State<AppState>,
    Json(payload): Json<CreateItemRequest>,
) -> Result<(StatusCode, Json<Item>), AppError> {
    let item = state.item_service.create(payload).await?;
    Ok((StatusCode::CREATED, Json(item)))
}

// Register in router:
Router::new()
    .route("/items", post(create_item))
    .with_state(state)
\`\`\``;
}

function getActixPattern(): string {
  return `### Actix-Web Handler Pattern

\`\`\`rust
use actix_web::{post, web, HttpResponse, Responder};

#[post("/items")]
async fn create_item(
    svc: web::Data<ItemService>,
    payload: web::Json<CreateItemRequest>,
) -> impl Responder {
    match svc.create(payload.into_inner()).await {
        Ok(item) => HttpResponse::Created().json(item),
        Err(AppError::NotFound(msg)) => HttpResponse::NotFound().json(json!({"error": msg})),
        Err(_) => HttpResponse::InternalServerError().finish(),
    }
}
\`\`\``;
}

function getRocketPattern(): string {
  return `### Rocket Handler Pattern

\`\`\`rust
use rocket::{post, serde::json::Json, State};

#[post("/items", data = "<payload>")]
async fn create_item(
    db: &State<DbPool>,
    payload: Json<CreateItemRequest>,
) -> Result<Created<Json<Item>>, Status> {
    let item = ItemService::create(db, payload.into_inner()).await
        .map_err(|_| Status::InternalServerError)?;
    let url = format!("/items/{}", item.id);
    Ok(Created::new(url).body(Json(item)))
}
\`\`\``;
}

// ─── JVM (Java / Kotlin) ─────────────────────────────────────────────────────

function getJvmSections(framework: Framework): StackSection[] {
  return [
    {
      title: "Project Structure",
      content: getJvmStructure(framework),
    },
    {
      title: "Code Patterns",
      content: getJvmPatterns(framework),
    },
  ];
}

function getJvmStructure(framework: Framework): string {
  const isKotlin = framework.language === "Kotlin";
  const ext = isKotlin ? "kt" : "java";
  const buildTool = framework.name === "Spring Boot" ? "Maven or Gradle" : "Maven/Gradle";

  if (framework.name === "Spring Boot") {
    return `\`\`\`
src/main/${isKotlin ? "kotlin" : "java"}/com/example/app/
├── Application.${ext}          # @SpringBootApplication entry
├── config/                     # @Configuration classes
├── controller/                 # @RestController — thin, delegates to service
│   └── ItemController.${ext}
├── service/                    # @Service — business logic
│   └── ItemService.${ext}
├── repository/                 # @Repository — Spring Data JPA
│   └── ItemRepository.${ext}
├── model/                      # JPA entities
│   └── Item.${ext}
├── dto/                        # Request/response POJOs or data classes
│   ├── ItemRequest.${ext}
│   └── ItemResponse.${ext}
└── exception/                  # @ControllerAdvice + custom exceptions
    └── GlobalExceptionHandler.${ext}
src/main/resources/
├── application.yml
└── application-production.yml
Build: ${buildTool}
\`\`\``;
  }

  return `\`\`\`
src/main/${isKotlin ? "kotlin" : "java"}/
└── com/example/app/
    ├── Main.${ext}
    ├── service/
    ├── model/
    └── repository/
src/main/resources/
└── application.yml
\`\`\``;
}

function getJvmPatterns(framework: Framework): string {
  const isKotlin = framework.language === "Kotlin";

  if (framework.name === "Spring Boot" && isKotlin) {
    return `### Controller Pattern (Kotlin)

\`\`\`kotlin
@RestController
@RequestMapping("/api/items")
class ItemController(private val itemService: ItemService) {  // constructor injection

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun createItem(@Valid @RequestBody request: ItemRequest): ItemResponse =
        itemService.create(request)

    @GetMapping("/{id}")
    fun getItem(@PathVariable id: Long): ItemResponse =
        itemService.findById(id) ?: throw ResourceNotFoundException("Item $id not found")
}
\`\`\`

### Service Pattern (Kotlin)

\`\`\`kotlin
@Service
@Transactional
class ItemService(private val itemRepository: ItemRepository) {

    fun create(request: ItemRequest): ItemResponse {
        val item = Item(name = request.name, owner = request.ownerId)
        return itemRepository.save(item).toResponse()
    }

    @Transactional(readOnly = true)
    fun findById(id: Long): ItemResponse? =
        itemRepository.findByIdOrNull(id)?.toResponse()
}
\`\`\`

### DTO Pattern (Kotlin data classes)

\`\`\`kotlin
data class ItemRequest(
    @field:NotBlank val name: String,
    val description: String? = null,
)

data class ItemResponse(val id: Long, val name: String, val createdAt: Instant)

// Extension function for mapping
fun Item.toResponse() = ItemResponse(id = id, name = name, createdAt = createdAt)
\`\`\``;
  }

  if (framework.name === "Spring Boot") {
    return `### Controller Pattern (Java)

\`\`\`java
@RestController
@RequestMapping("/api/items")
@RequiredArgsConstructor  // Lombok: generates constructor injection
public class ItemController {
    private final ItemService itemService;  // inject via constructor, not @Autowired field

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ItemResponse createItem(@Valid @RequestBody ItemRequest request) {
        return itemService.create(request);
    }

    @GetMapping("/{id}")
    public ItemResponse getItem(@PathVariable Long id) {
        return itemService.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Item " + id + " not found"));
    }
}
\`\`\`

### Service Pattern (Java)

\`\`\`java
@Service
@Transactional
@RequiredArgsConstructor
public class ItemService {
    private final ItemRepository itemRepository;

    public ItemResponse create(ItemRequest request) {
        Item item = new Item(request.getName());
        return ItemResponse.from(itemRepository.save(item));
    }

    @Transactional(readOnly = true)
    public Optional<ItemResponse> findById(Long id) {
        return itemRepository.findById(id).map(ItemResponse::from);
    }
}
\`\`\`

### Exception Handling

\`\`\`java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ErrorResponse handleNotFound(ResourceNotFoundException ex) {
        return new ErrorResponse(ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.UNPROCESSABLE_ENTITY)
    public ErrorResponse handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
            .map(e -> e.getField() + ": " + e.getDefaultMessage())
            .collect(Collectors.joining(", "));
        return new ErrorResponse(message);
    }
}
\`\`\``;
  }

  // Generic JVM
  return isKotlin
    ? `### Kotlin Style\n\`\`\`kotlin\nfun process(items: List<String>): Map<String, Int> =\n    items.groupBy { it }.mapValues { (_, v) -> v.size }\n\`\`\``
    : `### Java Style\n\`\`\`java\npublic Map<String, Long> process(List<String> items) {\n    return items.stream().collect(Collectors.groupingBy(s -> s, Collectors.counting()));\n}\n\`\`\``;
}
