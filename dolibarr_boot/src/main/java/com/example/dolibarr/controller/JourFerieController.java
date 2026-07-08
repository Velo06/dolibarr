package com.example.dolibarr.controller;

import com.example.dolibarr.dto.JourFerieDto;
import com.example.dolibarr.service.JourFerieService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.time.LocalDate;

/**
 * API REST CRUD pour les jours fériés.
 *
 * Endpoints :
 *   GET    /api/jours-feries        -> liste
 *   GET    /api/jours-feries/{id}   -> détail
 *   POST   /api/jours-feries        -> création
 *   PUT    /api/jours-feries/{id}   -> mise à jour
 *   DELETE /api/jours-feries/{id}   -> suppression
 *   DELETE /api/jours-feries        -> suppression de tous (réinitialisation)
 */
@RestController
@RequestMapping("/api/jours-feries")
@CrossOrigin(origins = "*")
public class JourFerieController {

    private final JourFerieService service;

    public JourFerieController(JourFerieService service) {
        this.service = service;
    }

    @GetMapping
    public List<JourFerieDto> findAll() {
        return service.findAll();
    }

    @GetMapping("/{id}")
    public JourFerieDto findById(@PathVariable Long id) {
        return service.findById(id);
    }

    @PostMapping
    public ResponseEntity<JourFerieDto> create(@RequestBody JourFerieDto dto) {
        JourFerieDto created = service.create(dto);
        return ResponseEntity
                .created(URI.create("/api/jours-feries/" + created.getId()))
                .body(created);
    }

    @PutMapping("/{id}")
    public JourFerieDto update(@PathVariable Long id, @RequestBody JourFerieDto dto) {
        return service.update(id, dto);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping
    public Map<String, Long> deleteAll() {
        long deleted = service.deleteAll();
        return Map.of("deleted", deleted);
    }

    @GetMapping("/{annee}/{mois}/{jour}")
    public boolean estJourFerie(@PathVariable int annee, @PathVariable int mois, @PathVariable int jour) {
        LocalDate date = LocalDate.of(annee, mois, jour);
        System.out.println("DATE VOARAY:" + date);
        return service.isJourFerie(date);
    }
}

