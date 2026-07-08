package com.example.dolibarr.service;

import com.example.dolibarr.dto.JourFerieDto;
import com.example.dolibarr.entity.JourFerie;
import com.example.dolibarr.repository.JourFerieRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.NoSuchElementException;

import java.time.LocalDate;

@Service
public class JourFerieService {

    private final JourFerieRepository repository;

    public JourFerieService(JourFerieRepository repository) {
        this.repository = repository;
    }

    public List<JourFerieDto> findAll() {
        return repository.findAll().stream()
                .map(this::toDto)
                .toList();
    }

    public JourFerieDto findById(Long id) {
        JourFerie entity = repository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Jour férié introuvable pour l'id " + id));
        return toDto(entity);
    }

    public JourFerieDto create(JourFerieDto dto) {
        if (dto.getDate() == null) {
            throw new IllegalArgumentException("Le champ 'date' est obligatoire.");
        }
        if (repository.existsByDate(dto.getDate())) {
            throw new IllegalArgumentException("Un jour férié existe déjà pour la date " + dto.getDate());
        }
        JourFerie entity = new JourFerie(dto.getLibelle(), dto.getDate());
        return toDto(repository.save(entity));
    }

    public JourFerieDto update(Long id, JourFerieDto dto) {
        if (dto.getDate() == null) {
            throw new IllegalArgumentException("Le champ 'date' est obligatoire.");
        }
        JourFerie entity = repository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Jour férié introuvable pour l'id " + id));

        repository.findByDate(dto.getDate())
                .filter(existing -> !existing.getId().equals(id))
                .ifPresent(existing -> {
                    throw new IllegalArgumentException("Un autre jour férié existe déjà pour la date " + dto.getDate());
                });
        entity.setLibelle(dto.getLibelle());
        entity.setDate(dto.getDate());
        return toDto(repository.save(entity));
    }

    public void delete(Long id) {
        if (!repository.existsById(id)) {
            throw new NoSuchElementException("Jour férié introuvable pour l'id " + id);
        }
        repository.deleteById(id);
    }

    /**
     * Supprime TOUS les jours fériés (réinitialisation des données).
     * @return le nombre de lignes supprimées
     */
    public long deleteAll() {
        long count = repository.count();
        repository.deleteAll();
        return count;
    }

    private JourFerieDto toDto(JourFerie entity) {
        return new JourFerieDto(entity.getId(), entity.getLibelle(), entity.getDate());
    }

    public boolean isJourFerie(LocalDate d) {
        return repository.existsByDate(d);
    }
}
